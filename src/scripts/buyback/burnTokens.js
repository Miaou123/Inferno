/**
 * Fixed burnTokens function with proper decimal handling
 * To replace the existing function in src/scripts/utils/solana.js
 */
const { 
    Connection, 
    PublicKey, 
    Keypair,
    TransactionInstruction,
    Transaction,
    sendAndConfirmTransaction
  } = require('@solana/web3.js');
  const { 
    burn,
    getOrCreateAssociatedTokenAccount,
    getMint
  } = require('@solana/spl-token');
  const logger = require('./logger');
  require('dotenv').config();
  
  // Token decimals from environment or default to 6 (most common)
  const TOKEN_DECIMALS = parseInt(process.env.TOKEN_DECIMALS || "6");
  
  /**
   * Burn tokens using SPL Token burn function with proper decimal handling
   * This is a direct replacement for the existing burnTokens function
   * 
   * @param {Keypair} senderKeypair - Keypair of the sender
   * @param {Number} amount - Amount of tokens to burn (human-readable)
   * @param {String} tokenAddress - Token mint address
   * @param {String} burnType - Type of burn ('milestone' or 'buyback')
   * @returns {Promise<Object>} Transaction result
   */
  const burnTokens = async (
    senderKeypair,
    amount,
    tokenAddress = process.env.TOKEN_ADDRESS,
    burnType = 'general'
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
      
      // Check wallet balance before proceeding
      logger.info(`Checking wallet balance for ${burnType} burn`);
      
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
      if (userTokenAccount.amount < amount) {
        logger.error(`Insufficient tokens in ${burnType} wallet. Required: ${amount.toLocaleString()}, Available: ${userTokenAccount.amount}`);
        return {
          success: false,
          error: 'INSUFFICIENT_TOKENS',
          details: {
            required: amount,
            available: userTokenAccount.amount.toString(),
            walletType: burnType
          }
        };
      }
      
      logger.info(`Sufficient tokens available in ${burnType} wallet. Required: ${amount.toLocaleString()}, Available: ${userTokenAccount.amount}`);
      
      // Convert amount to raw amount with decimals
      const rawAmount = amount * Math.pow(10, tokenDecimals);
      logger.info(`Converting ${amount.toLocaleString()} tokens to ${rawAmount.toLocaleString()} raw units (${tokenDecimals} decimals)`);
      
      try {
        // Execute the burn transaction using the SPL Token burn function
        logger.info(`Burning ${amount.toLocaleString()} tokens from account ${userTokenAccount.address.toString()}`);
        
        const signature = await burn(
          connection,
          senderKeypair,              // payer
          userTokenAccount.address,   // account
          tokenMint,                  // mint
          senderKeypair,              // owner
          rawAmount                   // amount with decimals
        );
        
        logger.info(`Burned ${amount.toLocaleString()} tokens successfully! Signature: ${signature}`);
        
        // Return success result in the format expected by the existing system
        return {
          success: true,
          signature,
          amount,
          rawAmount,
          decimals: tokenDecimals,
          sender: senderKeypair.publicKey.toString(),
          burnAddress,
          memo: `$INFERNO ${burnType.toUpperCase()} BURN: ${amount.toLocaleString()} tokens`
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
  
  module.exports = { burnTokens };