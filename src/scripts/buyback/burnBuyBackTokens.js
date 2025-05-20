/**
 * Buyback burn function for $INFERNO token
 * Handles token burning and records burns in burns.json for the buyback system
 */
const { 
    Connection, 
    PublicKey, 
    Keypair
  } = require('@solana/web3.js');
const { 
    burn,
    getOrCreateAssociatedTokenAccount,
    getMint
  } = require('@solana/spl-token');
const fileStorage = require('../utils/fileStorage');
const logger = require('../utils/logger').buyback;
require('dotenv').config();

// Token decimals from environment or default to 6 (most common)
const TOKEN_DECIMALS = parseInt(process.env.TOKEN_DECIMALS || "6");

/**
 * Burn tokens using SPL Token burn function with proper decimal handling
 * and record the burn in burns.json for the buyback system
 * 
 * @param {Keypair} senderKeypair - Keypair of the sender
 * @param {Number} amount - Amount of tokens to burn (human-readable)
 * @param {String} tokenAddress - Token mint address
 * @param {String} rewardId - ID of the reward that triggered this burn
 * @param {Number} solSpent - Amount of SOL used for the buyback
 * @param {Number} solSpentUsd - USD value of the SOL spent
 * @returns {Promise<Object>} Transaction result
 */
const burnBuybackTokens = async (
  senderKeypair,
  amount,
  tokenAddress = process.env.TOKEN_ADDRESS,
  rewardId = null,
  solSpent = 0,
  solSpentUsd = 0
) => {
  try {
    const connection = new Connection(process.env.SOLANA_RPC_URL, {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 60000 // 60 seconds
    });
    
    // Use burn address from environment or fall back to standard address
    const burnAddress = process.env.BURN_ADDRESS || "1nc1nerator11111111111111111111111111111111";
    
    // Convert tokenAddress to PublicKey
    const tokenMint = new PublicKey(tokenAddress);
    
    // Apply a 1% safety buffer to the quoted amount
    // This helps avoid "insufficient funds" errors if the actual received amount is slightly less
    const safeAmount = Math.floor(amount * 0.99); // 1% safety buffer
    logger.info(`Applying 1% safety buffer: ${amount} → ${safeAmount} tokens`);
    
    // Check wallet balance before proceeding
    logger.info(`Checking wallet balance for buyback burn`);
    
    // Get the mint info to determine decimals
    let tokenDecimals = TOKEN_DECIMALS;
    try {
      const mintInfo = await getMint(connection, tokenMint);
      tokenDecimals = mintInfo.decimals;
      logger.info(`Detected token decimals: ${tokenDecimals}`);
    } catch (error) {
      logger.warn(`Could not detect token decimals, using default: ${TOKEN_DECIMALS}. Error: ${error.message}`);
    }
    
    // Get the sender's token account
    let userTokenAccount;
    try {
      userTokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        senderKeypair,
        tokenMint,
        senderKeypair.publicKey
      );
      
      logger.info(`Found token account: ${userTokenAccount.address.toString()}`);
    } catch (error) {
      logger.error(`Error getting token account: ${error.message}`);
      return {
        success: false,
        error: 'TOKEN_ACCOUNT_ERROR',
        details: error.message
      };
    }
    
    // Safety check: Verify there are sufficient tokens in the wallet
    if (userTokenAccount.amount < safeAmount * Math.pow(10, tokenDecimals)) {
      logger.error(`Insufficient tokens in buyback wallet. Required: ${safeAmount.toLocaleString()}, Available: ${(userTokenAccount.amount / Math.pow(10, tokenDecimals)).toLocaleString()}`);
      return {
        success: false,
        error: 'INSUFFICIENT_TOKENS',
        details: {
          required: safeAmount,
          available: (userTokenAccount.amount / Math.pow(10, tokenDecimals)).toString()
        }
      };
    }
    
    logger.info(`Sufficient tokens available in buyback wallet. Required: ${safeAmount.toLocaleString()}, Available: ${userTokenAccount.amount}`);
    
    // Convert amount to raw amount with decimals
    const rawAmount = safeAmount * Math.pow(10, tokenDecimals);
    logger.info(`Converting ${safeAmount.toLocaleString()} tokens to ${rawAmount.toLocaleString()} raw units (${tokenDecimals} decimals)`);
    
    try {
      // Execute the burn transaction using the SPL Token burn function
      logger.info(`Burning ${safeAmount.toLocaleString()} tokens from account ${userTokenAccount.address.toString()}`);
      
      const signature = await burn(
        connection,
        senderKeypair,              // payer
        userTokenAccount.address,   // account
        tokenMint,                  // mint
        senderKeypair,              // owner
        rawAmount                   // amount with decimals
      );
      
      logger.info(`Burned ${amount.toLocaleString()} tokens successfully! Signature: ${signature}`);

      // Get transaction details
      let txDetails;
      try {
        txDetails = await connection.getTransaction(signature, {
          commitment: 'confirmed',
          maxSupportedTransactionVersion: 0
        });
        logger.info('Retrieved transaction details');
      } catch (txError) {
        logger.warn(`Could not retrieve transaction details: ${txError.message}`);
        // Continue even if we can't get details
      }
      
      // Create burn record in burns.json with the format matching milestone burns
      const burnRecord = {
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        timestamp: new Date().toISOString(),
        burnType: 'buyback',
        burnAmount: amount,
        txSignature: signature,
        initiator: 'buyback-script',
        solSpent: solSpent,
        solSpentUsd: solSpentUsd,
        rewardId: rewardId,
        details: {
          blockTime: txDetails?.blockTime ? new Date(txDetails.blockTime * 1000).toISOString() : null,
          fee: txDetails?.meta?.fee || null,
          slot: txDetails?.slot || null,
          decimals: tokenDecimals,
          rawAmount: rawAmount
        }
      };
      
      // Save the burn record to burns.json
      fileStorage.saveRecord('burns', burnRecord);
      logger.info(`Burn record saved to burns.json with ID: ${burnRecord.id}`);
      
      // Update reward record if rewardId is provided
      if (rewardId) {
        const rewards = fileStorage.readData(fileStorage.FILES.rewards);
        const updatedRewards = rewards.map(r => {
          if (r.id === rewardId) {
            return {
              ...r,
              tokensBurned: amount,
              burnTxSignature: signature,
              status: 'burned',
              updatedAt: new Date().toISOString()
            };
          }
          return r;
        });
        
        fileStorage.writeData(fileStorage.FILES.rewards, updatedRewards);
        logger.info(`Updated reward record ${rewardId} with burn information`);
      }
      
      // Return success result
      return {
        success: true,
        signature,
        amount,
        burnRecord,
        rawAmount,
        decimals: tokenDecimals,
        sender: senderKeypair.publicKey.toString(),
        burnAddress,
        memo: `$INFERNO BUYBACK BURN: ${amount.toLocaleString()} tokens`
      };
    } catch (txError) {
      // Handle transaction errors with the same error categorization as before
      logger.error(`Transaction failed: ${txError.message}`);
      
      let errorType = 'UNKNOWN';
      const errorMessage = txError.message || '';
      
      if (errorMessage.includes('insufficient funds')) {
        errorType = 'INSUFFICIENT_FUNDS';
      } else if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
        errorType = 'RATE_LIMIT';
      } else if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
        errorType = 'TIMEOUT';
      } else if (errorMessage.includes('blockhash not found') || errorMessage.includes('old blockhash')) {
        errorType = 'BLOCKHASH_EXPIRED';
      } else if (errorMessage.includes('network error') || errorMessage.includes('connection error')) {
        errorType = 'NETWORK_ERROR';
      }
      
      return {
        success: false,
        error: errorType,
        details: errorMessage
      };
    }
  } catch (error) {
    logger.error('Error in burn process:', error);
    return {
      success: false,
      error: 'PROCESSING_ERROR',
      details: error.message
    };
  }
};

module.exports = { burnBuybackTokens };