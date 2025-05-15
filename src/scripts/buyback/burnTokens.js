/**
 * Token burning utility for $INFERNO token
 * Part of the buyback system
 */
const logger = require('../utils/logger').buyback;
const fileStorage = require('../utils/fileStorage');
const { createKeypair, burnTokens, getEnhancedTransactionDetails } = require('../utils/solana');
const { updateMetricsAfterBurn } = require('./utils/metrics');
require('dotenv').config();

/**
 * Burn tokens purchased from buyback
 * @param {Number} tokenAmount - Amount of tokens to burn
 * @param {String} rewardId - Storage ID of the reward record
 * @returns {Promise<Object>} Burn result
 */
const burnBuybackTokens = async (tokenAmount, rewardId) => {
  try {
    logger.info(`Burning ${tokenAmount} tokens from buyback`);
    
    // Get keypair
    const keypair = createKeypair();
    
    // Execute burn with retry mechanism for Helius
    const maxRetries = 3;
    let retryCount = 0;
    let burnResult;
    
    while (retryCount < maxRetries) {
      try {
        // Execute burn with Helius-optimized parameters
        burnResult = await burnTokens(
          keypair, 
          tokenAmount,
          process.env.TOKEN_ADDRESS,
          'buyback'
        );
        
        if (burnResult.success) {
          break; // Success, exit retry loop
        } else {
          // Check if this is a recoverable error (rate limit, etc.)
          const isRateLimitError = burnResult.error && 
            (burnResult.error.includes('429') || 
             burnResult.error.includes('rate limit') ||
             burnResult.error.includes('too many requests'));
             
          if (isRateLimitError && retryCount < maxRetries - 1) {
            // Exponential backoff
            const backoffMs = Math.pow(2, retryCount) * 1000;
            logger.warn(`Rate limit reached, retrying in ${backoffMs}ms (attempt ${retryCount + 1}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, backoffMs));
            retryCount++;
          } else {
            // Non-recoverable error or max retries reached
            logger.error(`Failed to burn tokens: ${burnResult.error}`);
            
            // Update reward record with error
            if (rewardId) {
              const rewards = fileStorage.readData(fileStorage.FILES.rewards);
              const updatedRewards = rewards.map(r => {
                if (r.id === rewardId) {
                  return {
                    ...r,
                    status: 'failed',
                    errorMessage: burnResult.error,
                    updatedAt: new Date().toISOString()
                  };
                }
                return r;
              });
              
              fileStorage.writeData(fileStorage.FILES.rewards, updatedRewards);
            }
            
            return burnResult;
          }
        }
      } catch (err) {
        // Handle unexpected errors in the burn function
        logger.error(`Unexpected error during burn (attempt ${retryCount + 1}/${maxRetries}):`, err);
        
        if (retryCount < maxRetries - 1) {
          const backoffMs = Math.pow(2, retryCount) * 1000;
          await new Promise(resolve => setTimeout(resolve, backoffMs));
          retryCount++;
        } else {
          throw err; // Re-throw if max retries reached
        }
      }
    }
    
    if (!burnResult || !burnResult.success) {
      logger.error('Failed to burn tokens after maximum retries');
      return { success: false, error: 'Maximum retry attempts reached' };
    }
    
    // Get detailed transaction information from Helius
    let txDetails;
    
    try {
      txDetails = await getEnhancedTransactionDetails(burnResult.signature);
      logger.info('Retrieved enhanced transaction details from Helius');
    } catch (txError) {
      logger.warn(`Could not retrieve enhanced transaction details: ${txError.message}`);
      // Continue even if we can't get enhanced details
    }
    
    // Create burn record with enhanced data if available
    const burnRecord = {
      burnType: 'buyback',
      amount: tokenAmount,
      txSignature: burnResult.signature,
      initiator: 'buyback-script',
      timestamp: new Date().toISOString(),
      details: {
        source: 'creator-rewards',
        rewardId,
        blockTime: txDetails?.blockTime ? new Date(txDetails.blockTime * 1000).toISOString() : null,
        fee: txDetails?.meta?.fee || null,
        slot: txDetails?.slot || null,
        // Include any Helius-specific data
        heliusData: txDetails ? {
          tokenTransfers: txDetails.meta?.tokenTransfers || null,
          accountData: txDetails.meta?.loadedAddresses || null,
        } : null
      }
    };
    
    const savedBurn = fileStorage.saveRecord('burns', burnRecord);
    
    // Update reward record
    const rewards = fileStorage.readData(fileStorage.FILES.rewards);
    const updatedRewards = rewards.map(r => {
      if (r.id === rewardId) {
        return {
          ...r,
          tokensBurned: tokenAmount,
          burnTxSignature: burnResult.signature,
          status: 'burned',
          burnId: savedBurn.id,
          updatedAt: new Date().toISOString()
        };
      }
      return r;
    });
    
    fileStorage.writeData(fileStorage.FILES.rewards, updatedRewards);
    
    // Update metrics
    await updateMetricsAfterBurn(tokenAmount, 'buyback');
    
    logger.info(`Successfully burned ${tokenAmount} tokens (tx: ${burnResult.signature})`);
    return {
      success: true,
      amount: tokenAmount,
      txSignature: burnResult.signature,
      burnId: savedBurn.id
    };
  } catch (error) {
    logger.error('Error burning buyback tokens:', error);
    
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
  burnBuybackTokens
};