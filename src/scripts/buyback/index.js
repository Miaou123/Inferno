/**
 * Automatic Buyback and Burn Script for $INFERNO token
 * Monitors creator revenue sharing from pump.fun, claims rewards,
 * buys back tokens, and burns them automatically
 */
const cron = require('node-cron');
const logger = require('../utils/logger').buyback;
const fileStorage = require('../utils/fileStorage');

// Import modular components
const { checkAvailableRewards } = require('./checkRewards');
const { claimRewards } = require('./claimRewards');
const { executeBuyback } = require('./executeBuyback');
const { burnBuybackTokens } = require('./burnBuyBackTokens');

require('dotenv').config();

// Configuration from environment variables
const config = {
  rewardThreshold: parseFloat(process.env.REWARDS_CLAIM_THRESHOLD) || 0.3,
  maxSlippage: parseFloat(process.env.MAX_SLIPPAGE_PERCENT) || 3,
  buybackInterval: parseInt(process.env.BUYBACK_INTERVAL_MINUTES) || 30
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
    const rewardsInfo = await checkAvailableRewards();
    
    if (!rewardsInfo.success) {
      logger.error(`Failed to check available rewards: ${rewardsInfo.error}`);
      return;
    }
    
    logger.info(`Available rewards: ${rewardsInfo.availableAmount} SOL`);
    
    // Check if rewards are above threshold
    if (rewardsInfo.availableAmount < config.rewardThreshold) {
      logger.info(`Available rewards (${rewardsInfo.availableAmount} SOL) below threshold (${config.rewardThreshold} SOL)`);
      return;
    }
    
    // Claim rewards
    const claimResult = await claimRewards();
    
    if (!claimResult.success) {
      logger.error(`Failed to claim rewards, aborting buyback: ${claimResult.error}`);
      return;
    }
    
    logger.info(`Successfully claimed ${claimResult.amount} SOL ($${claimResult.amountUsd.toFixed(2)}) in rewards`);
    
    // Execute buyback
    const buybackResult = await executeBuyback(claimResult.amount, claimResult.rewardId);
    
    if (!buybackResult.success) {
      logger.error(`Failed to execute buyback, aborting process: ${buybackResult.error}`);
      return;
    }
    
    logger.info(`Successfully bought ${buybackResult.tokenAmount} tokens with ${buybackResult.solAmount} SOL`);
    
    // Burn tokens
    const burnResult = await burnBuybackTokens(buybackResult.tokenAmount, claimResult.rewardId);
    
    if (!burnResult.success) {
      logger.error(`Failed to burn tokens: ${burnResult.error}`);
      return;
    }
    
    logger.info(`Successfully burned ${burnResult.amount} tokens (tx: ${burnResult.txSignature})`);
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
    
    logger.info('Buyback and burn monitoring starting');
    logger.info(`Reward threshold: ${config.rewardThreshold} SOL`);
    logger.info(`Max slippage: ${config.maxSlippage}%`);
    logger.info(`Check interval: ${config.buybackInterval} minutes`);
    
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
  checkAvailableRewards,
  claimRewards,
  executeBuyback,
  burnBuybackTokens,
  performBuybackAndBurn,
  startBuybackMonitoring,
  config
};