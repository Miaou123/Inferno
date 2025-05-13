/**
 * Automatic Buyback and Burn Script for $INFERNO token
 * Monitors creator revenue sharing from pump.fun, claims rewards,
 * buys back tokens, and burns them automatically
 */
const cron = require('node-cron');
const axios = require('axios');
const { 
  createKeypair, 
  getConnection, 
  getSolBalance,
  burnTokens 
} = require('../utils/solana');
const { fetchTokenPrice } = require('../utils/priceOracle');
const logger = require('../utils/logger').buyback;
const fileStorage = require('../utils/fileStorage');
require('dotenv').config();

// Configuration from environment variables
const config = {
  rewardThreshold: parseFloat(process.env.REWARD_THRESHOLD_SOL) || 0.05,
  maxSlippage: parseFloat(process.env.MAX_SLIPPAGE_PERCENT) || 2,
  buybackInterval: parseInt(process.env.BUYBACK_INTERVAL_MINUTES) || 60
};

/**
 * Check for available creator rewards
 * @returns {Promise<Object>} Reward status
 */
const checkCreatorRewards = async () => {
  try {
    logger.info('Checking for available creator rewards');
    
    // Get keypair
    const keypair = createKeypair();
    
    // Get current SOL balance
    const solBalance = await getSolBalance(keypair.publicKey.toString());
    logger.info(`Current wallet SOL balance: ${solBalance}`);
    
    // TODO: Integrate with pump.fun's API to check for available rewards
    // This is a placeholder implementation
    // In production, you would call their API
    
    // For now, simulate by checking if wallet has enough SOL
    if (solBalance >= config.rewardThreshold) {
      logger.info(`Wallet has enough SOL (${solBalance}) to trigger buyback`);
      return {
        available: true,
        amount: solBalance
      };
    }
    
    logger.info(`Wallet balance (${solBalance} SOL) below threshold (${config.rewardThreshold} SOL)`);
    return {
      available: false,
      amount: solBalance
    };
  } catch (error) {
    logger.error('Error checking creator rewards:', error);
    return { available: false, error: error.message };
  }
};

/**
 * Claim rewards from pump.fun
 * @returns {Promise<Object>} Claim result
 */
const claimRewards = async () => {
  try {
    logger.info('Claiming creator rewards');
    
    // TODO: Integrate with pump.fun's API to claim rewards
    // This is a placeholder implementation
    // In production, you would call their API
    
    // For now, simulate successful claim
    const claimAmount = config.rewardThreshold;
    const txSignature = 'simulated_claim_tx_signature';
    
    // Record the claim in storage
    const rewardRecord = {
      solAmount: claimAmount,
      claimTxSignature: txSignature,
      status: 'claimed',
      timestamp: new Date().toISOString()
    };
    
    const savedReward = fileStorage.saveRecord('rewards', rewardRecord);
    
    logger.info(`Claimed ${claimAmount} SOL with tx: ${txSignature}`);
    return {
      success: true,
      amount: claimAmount,
      txSignature,
      rewardId: savedReward.id
    };
  } catch (error) {
    logger.error('Error claiming rewards:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Execute token buyback using SOL
 * @param {Number} solAmount - Amount of SOL to use for buyback
 * @param {String} rewardId - Storage ID of the reward record
 * @returns {Promise<Object>} Buyback result
 */
const executeBuyback = async (solAmount, rewardId) => {
  try {
    logger.info(`Executing buyback with ${solAmount} SOL`);
    
    // Get token price
    const { tokenPriceInSol } = await fetchTokenPrice();
    
    // Calculate amount of tokens to buy (accounting for slippage)
    const slippageBuffer = 1 - (config.maxSlippage / 100);
    const expectedTokenAmount = (solAmount / tokenPriceInSol) * slippageBuffer;
    
    logger.info(`Expected token amount: ${expectedTokenAmount} at price ${tokenPriceInSol} SOL per token`);
    
    // TODO: Integrate with pump.fun's swap API to execute the buyback
    // This is a placeholder implementation
    // In production, you would integrate with their swap functionality
    
    // For now, simulate successful buyback
    const actualTokenAmount = expectedTokenAmount * 0.99; // Simulate slight slippage
    const txSignature = 'simulated_buyback_tx_signature';
    
    // Update the reward record
    const rewards = fileStorage.readData(fileStorage.FILES.rewards);
    const updatedRewards = rewards.map(r => {
      if (r.id === rewardId) {
        return {
          ...r,
          tokensBought: actualTokenAmount,
          buyTxSignature: txSignature,
          status: 'bought',
          updatedAt: new Date().toISOString()
        };
      }
      return r;
    });
    
    fileStorage.writeData(fileStorage.FILES.rewards, updatedRewards);
    
    logger.info(`Bought ${actualTokenAmount} tokens with ${solAmount} SOL (tx: ${txSignature})`);
    return {
      success: true,
      tokenAmount: actualTokenAmount,
      solAmount,
      txSignature
    };
  } catch (error) {
    logger.error('Error executing buyback:', error);
    
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
    const { getEnhancedTransactionDetails } = require('../utils/solana');
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
    await updateMetrics(tokenAmount);
    
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

/**
 * Update token metrics after a burn
 * @param {Number} burnAmount - Amount of tokens burned
 */
const updateMetrics = async (burnAmount) => {
  try {
    // Get current metrics
    const metrics = fileStorage.findRecords('metrics', () => true, { 
      sort: { field: 'timestamp', order: 'desc' }, 
      limit: 1 
    });
    
    const latestMetrics = metrics[0];
    
    // If no metrics exist, create a new baseline
    if (!latestMetrics) {
      const initialSupply = Number(process.env.INITIAL_SUPPLY) || 1000000000;
      const newMetrics = {
        timestamp: new Date().toISOString(),
        totalSupply: initialSupply - burnAmount,
        circulatingSupply: initialSupply - burnAmount - (initialSupply * 0.3), // Reserve wallet not affected by buyback burns
        reserveWalletBalance: initialSupply * 0.3,
        totalBurned: burnAmount,
        buybackBurned: burnAmount,
        milestoneBurned: 0
      };
      
      fileStorage.saveRecord('metrics', newMetrics);
      return;
    }
    
    // Create new metrics entry
    const newMetrics = {
      timestamp: new Date().toISOString(),
      totalSupply: latestMetrics.totalSupply - burnAmount,
      circulatingSupply: latestMetrics.circulatingSupply - burnAmount,
      reserveWalletBalance: latestMetrics.reserveWalletBalance,
      totalBurned: latestMetrics.totalBurned + burnAmount,
      buybackBurned: latestMetrics.buybackBurned + burnAmount,
      milestoneBurned: latestMetrics.milestoneBurned,
      priceInSol: latestMetrics.priceInSol,
      priceInUsd: latestMetrics.priceInUsd,
      marketCap: latestMetrics.marketCap
    };
    
    fileStorage.saveRecord('metrics', newMetrics);
    logger.info('Metrics updated successfully');
  } catch (error) {
    logger.error(`Error updating metrics: ${error}`);
  }
};

/**
 * Execute the complete buyback and burn process
 */
const performBuybackAndBurn = async () => {
  try {
    logger.info('Starting buyback and burn process');
    
    // Initialize storage
    fileStorage.initializeStorage();
    
    // Check for available rewards
    const rewardsStatus = await checkCreatorRewards();
    
    if (!rewardsStatus.available) {
      logger.info('No rewards available for buyback');
      return;
    }
    
    // Claim rewards (in production, this would actually claim from pump.fun)
    const claimResult = await claimRewards();
    
    if (!claimResult.success) {
      logger.error('Failed to claim rewards, aborting buyback');
      return;
    }
    
    // Execute buyback
    const buybackResult = await executeBuyback(claimResult.amount, claimResult.rewardId);
    
    if (!buybackResult.success) {
      logger.error('Failed to execute buyback, aborting process');
      return;
    }
    
    // Burn tokens
    const burnResult = await burnBuybackTokens(buybackResult.tokenAmount, claimResult.rewardId);
    
    if (!burnResult.success) {
      logger.error('Failed to burn tokens');
      return;
    }
    
    logger.info('Buyback and burn process completed successfully');
  } catch (error) {
    logger.error('Error in buyback and burn process:', error);
  }
};

/**
 * Start the buyback and burn monitoring process
 */
const startBuybackMonitoring = async () => {
  try {
    // Initialize storage
    fileStorage.initializeStorage();
    
    // Run initial buyback
    await performBuybackAndBurn();
    
    // Schedule regular buybacks
    const cronSchedule = `*/${config.buybackInterval} * * * *`;
    cron.schedule(cronSchedule, async () => {
      logger.info('Running scheduled buyback and burn');
      await performBuybackAndBurn();
    });
    
    logger.info(`Buyback and burn monitoring started, running every ${config.buybackInterval} minutes`);
  } catch (error) {
    logger.error(`Error starting buyback monitoring: ${error}`);
    process.exit(1);
  }
};

// Handle graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully');
  process.exit(0);
});

// Start the script if it's run directly
if (require.main === module) {
  startBuybackMonitoring();
}

// Export functions for testing and importing
module.exports = {
  checkCreatorRewards,
  claimRewards,
  executeBuyback,
  burnBuybackTokens,
  performBuybackAndBurn,
  startBuybackMonitoring
};