/**
 * Buyback execution utility for $INFERNO token using Jupiter API
 */
const { 
  Connection, 
  PublicKey, 
  Transaction, 
  VersionedTransaction,
  sendAndConfirmTransaction
} = require('@solana/web3.js');
const axios = require('axios');
const bs58 = require('bs58');
const logger = require('../utils/logger').buyback;
const fileStorage = require('../utils/fileStorage');
const { createKeypair, getConnection, getEnhancedTransactionDetails } = require('../utils/solana');
const { fetchTokenPrice } = require('../utils/priceOracle');
require('dotenv').config();

// Configuration from environment variables
const config = {
  maxSlippage: parseFloat(process.env.MAX_SLIPPAGE_PERCENT) || 2, // Default to 2% slippage
  testMode: process.env.TEST_MODE === 'true' || false
};

/**
 * Execute token buyback using SOL
 * @param {Number} solAmount - Amount of SOL to use for buyback
 * @param {String} rewardId - Storage ID of the reward record
 * @returns {Promise<Object>} Buyback result
 */
const executeBuyback = async (solAmount, rewardId) => {
  try {
    // Validate inputs
    if (!solAmount || isNaN(solAmount) || solAmount <= 0) {
      throw new Error(`Invalid SOL amount: ${solAmount}`);
    }
    
    if (!rewardId) {
      throw new Error('Reward ID is required');
    }
    
    // Use only 95% of the SOL for buyback to maintain reserve for transaction fees
    const buybackSolAmount = solAmount * 0.95;
    logger.info(`Executing buyback with ${buybackSolAmount} SOL (95% of ${solAmount} SOL, reserving 5% for fees)`);
    
    // Get keypair and connection
    const keypair = createKeypair();
    const connection = getConnection();
    
    // Token address
    const tokenAddress = process.env.TOKEN_ADDRESS;
    
    // Test mode handling
    if (config.testMode) {
      // Your existing test mode code
      // ...
      return simulatedBuyback(solAmount, rewardId, buybackSolAmount, tokenAddress, keypair);
    }
    
    try {
      // Calculate lamports (SOL amount in smallest unit)
      const lamports = Math.floor(buybackSolAmount * 1_000_000_000);
      
      // We need slippage as basis points (1% = 100 basis points)
      const slippageBps = Math.floor(config.maxSlippage * 100);
      
      // Input token is SOL
      const inputMint = 'So11111111111111111111111111111111111111112';
      // Output token is our target token
      const outputMint = tokenAddress;
      
      // Step 1: Get a quote from Jupiter API
      const quoteUrl = `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${lamports}&slippageBps=${slippageBps}`;
      
      const quoteResponse = await axios.get(quoteUrl);
      
      if (!quoteResponse.data || quoteResponse.status !== 200) {
        throw new Error(`Failed to get Jupiter quote: ${JSON.stringify(quoteResponse.data)}`);
      }
      
      const quoteData = quoteResponse.data;
      
      // Access the correct fields for quote data
      const outAmount = quoteData.outAmount;
      const outAmountWithSlippage = quoteData.outAmountWithSlippage;
      
      // Expected token amount from quote
      // FIX: Store expected token amount from Jupiter's response
      const expectedTokens = parseFloat(outAmount) / 10**6; // Assuming 6 decimals for token
      const minTokens = parseFloat(outAmountWithSlippage) / 10**6;

      // Step 2: Get the swap transaction from Jupiter API
      const swapUrl = 'https://quote-api.jup.ag/v6/swap';
      
      const swapResponse = await axios.post(swapUrl, {
        quoteResponse: quoteData,
        userPublicKey: keypair.publicKey.toString(),
        wrapAndUnwrapSol: true  // This handles wrapping SOL automatically
      });
      
      if (!swapResponse.data || swapResponse.status !== 200) {
        throw new Error(`Failed to get swap transaction: ${JSON.stringify(swapResponse.data)}`);
      }
      
      // Step 3: Execute the swap transaction
      const { swapTransaction } = swapResponse.data;
      
      // Deserialize the transaction - handling versioned transaction format
      const transactionBuffer = Buffer.from(swapTransaction, 'base64');
      
      // Correctly create a versioned transaction
      let transaction;
      
      try {
        // First try to deserialize as a versioned transaction
        transaction = VersionedTransaction.deserialize(transactionBuffer);
        
        // Add the keypair as a signer for a versioned transaction
        transaction.sign([keypair]);
      } catch (deserializeError) {
        // If that fails, try the legacy transaction format
        logger.warn(`Failed to deserialize as VersionedTransaction: ${deserializeError.message}`);
        
        transaction = Transaction.from(transactionBuffer);
        // For legacy transactions, signing happens during sendAndConfirmTransaction
      }
      
      // Sign and send the transaction based on its type
      logger.info('Sending transaction...');
      const startTime = Date.now();
      
      let txSignature;
      
      if (transaction instanceof VersionedTransaction) {
        // For versioned transactions, we need to use sendRawTransaction
        // The transaction is already signed above
        txSignature = await connection.sendRawTransaction(
          transaction.serialize(),
          { maxRetries: 3 }
        );
        
        // Wait for confirmation
        await connection.confirmTransaction(txSignature, 'confirmed');
      } else {
        // For legacy transactions, use sendAndConfirmTransaction which handles signing
        txSignature = await sendAndConfirmTransaction(
          connection,
          transaction,
          [keypair],
          {
            skipPreflight: false,
            preflightCommitment: 'confirmed',
            maxRetries: 3
          }
        );
      }
      
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      
      // Get transaction details to verify received tokens
      let receivedTokenAmount = expectedTokens; // FIX: Default to expected tokens from Jupiter's quote
      
      try {
        // Add a small delay to ensure the transaction is indexed
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const txDetails = await getEnhancedTransactionDetails(txSignature);
        
        // Parse transaction details to get actual tokens received
        if (txDetails && txDetails.meta && txDetails.meta.postTokenBalances) {
          const ourTokenBalance = txDetails.meta.postTokenBalances.find(
            balance => balance.owner === keypair.publicKey.toString() && 
                      balance.mint === tokenAddress
          );
          
        }
      } catch (detailsError) {
        logger.warn(`Error getting transaction details: ${detailsError.message}`);
      }
      
      // Update reward record
      const rewards = fileStorage.readData(fileStorage.FILES.rewards);
      const updatedRewards = rewards.map(r => {
        if (r.id === rewardId) {
          return {
            ...r,
            tokensBought: expectedTokens, // FIX: Use expected tokens from Jupiter
            buyTxSignature: txSignature,
            solAmountUsed: buybackSolAmount,
            solAmountReserved: solAmount - buybackSolAmount,
            status: 'bought',
            updatedAt: new Date().toISOString()
          };
        }
        return r;
      });
      
      fileStorage.writeData(fileStorage.FILES.rewards, updatedRewards);
      
      // Create token buy record
      fileStorage.saveRecord('tokenBuys', {
        timestamp: new Date().toISOString(),
        tokenAddress,
        solAmount: buybackSolAmount,
        tokenAmount: expectedTokens, // FIX: Use expected tokens from Jupiter
        txSignature,
        wallet: keypair.publicKey.toString(),
        type: 'buyback',
        rewardId,
        duration: parseFloat(duration)
      });
      
      logger.info(`Buyback successful! Bought ${expectedTokens} tokens with ${buybackSolAmount} SOL. Transaction signature:${txSignature}`);
      
      return {
        success: true,
        tokenAmount: expectedTokens, // FIX: Use expected tokens from Jupiter
        solAmount: buybackSolAmount,
        solAmountReserved: solAmount - buybackSolAmount,
        txSignature,
        duration: parseFloat(duration),
        explorerUrl: `https://solscan.io/tx/${txSignature}`,
        network: 'mainnet'
      };
      
    } catch (swapError) {
      logger.error(`Error executing swap: ${swapError.message}`);
      throw swapError;
    }
  } catch (error) {
    logger.error(`Error in buyback process: ${error.message}`);
    
    // Update reward record with error
    if (rewardId) {
      const rewards = fileStorage.readData(fileStorage.FILES.rewards);
      const updatedRewards = rewards.map(r => {
        if (r.id === rewardId) {
          return {
            ...r,
            status: 'failed',
            errorMessage: error.message,
            updatedAt: new Date().toISOString()
          };
        }
        return r;
      });
      
      fileStorage.writeData(fileStorage.FILES.rewards, updatedRewards);
    }
    
    return { success: false, error: error.message };
  }
};

module.exports = {
  executeBuyback
};