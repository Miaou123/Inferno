/**
 * Rewards claim script for $INFERNO token
 * Automatically claims creator rewards from pump.fun and processes them
 */
const cron = require('node-cron');
const logger = require('../utils/logger').rewards;
const { claimRewards, checkAvailableRewards } = require('../utils/claimRewards');
const { buyTokens } = require('../buyback/index');
require('dotenv').config();

// How often to check for rewards (in minutes)
const REWARDS_CHECK_INTERVAL_MINUTES = parseInt(process.env.REWARDS_CHECK_INTERVAL_MINUTES) || 60;

// Minimum amount to claim (in SOL)
const REWARDS_CLAIM_THRESHOLD = parseFloat(process.env.REWARDS_CLAIM_THRESHOLD) || 0.1;

/**
 * Main function to check and claim rewards
 */
const processRewards = async () => {
  try {
    logger.info('Checking for available rewards');
    
    // Check available rewards
    const rewardsInfo = await checkAvailableRewards();
    
    if (!rewardsInfo.success) {
      logger.error(`Failed to check available rewards: ${rewardsInfo.error}`);
      return;
    }
    
    logger.info(`Available rewards: ${rewardsInfo.availableAmount} SOL`);
    
    // If available amount is below threshold, skip claiming
    if (rewardsInfo.availableAmount < REWARDS_CLAIM_THRESHOLD) {
      logger.info(`Available rewards (${rewardsInfo.availableAmount} SOL) below threshold (${REWARDS_CLAIM_THRESHOLD} SOL), skipping claim`);
      return;
    }
    
    // Claim rewards
    logger.info(`Claiming ${rewardsInfo.availableAmount} SOL in rewards`);
    const claimResult = await claimRewards();
    
    if (!claimResult.success) {
      logger.error(`Failed to claim rewards: ${claimResult.error}`);
      return;
    }
    
    logger.info(`Successfully claimed ${claimResult.amount} SOL ($${claimResult.amountUsd.toFixed(2)}) in rewards`);
    
    // Use claimed rewards for buyback & burn
    if (process.env.AUTO_PROCESS_REWARDS === 'true') {
      logger.info('Processing claimed rewards for buyback & burn');
      
      // Call buyback function with claimed rewards
      const buybackResult = await buyTokens(claimResult.amount);
      
      if (!buybackResult.success) {
        logger.error(`Failed to process rewards for buyback: ${buybackResult.error}`);
        return;
      }
      
      logger.info(`Successfully processed rewards for buyback & burn: Burned ${buybackResult.tokensBurned} tokens`);
    }
    
    logger.info('Rewards processing completed successfully');
  } catch (error) {
    logger.error(`Error in rewards process: ${error}`);
  }
};

/**
 * Initialize and start the rewards claim scheduler
 */
const initializeRewardsScheduler = () => {
  try {
    logger.info(`Initializing rewards claim scheduler with ${REWARDS_CHECK_INTERVAL_MINUTES} minute interval`);
    
    // Schedule the rewards check & claim process
    cron.schedule(`*/${REWARDS_CHECK_INTERVAL_MINUTES} * * * *`, async () => {
      logger.info('Running scheduled rewards check and claim process');
      await processRewards();
    });
    
    // Run immediately on startup
    logger.info('Running initial rewards check and claim process');
    processRewards();
    
    logger.info('Rewards claim scheduler initialized successfully');
  } catch (error) {
    logger.error(`Error initializing rewards scheduler: ${error}`);
  }
};

// If this script is run directly, initialize the scheduler
if (require.main === module) {
  initializeRewardsScheduler();
}

module.exports = {
  processRewards,
  initializeRewardsScheduler
};