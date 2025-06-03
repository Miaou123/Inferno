/**
 * Automatic Buyback and Burn Script for $INFERNO token
 * Monitors creator revenue sharing from pump.fun, claims rewards,
 * buys back tokens, and burns them automatically
 */
const cron = require('node-cron');
const logger = require('../utils/logger').buyback;
const fileStorage = require('../utils/fileStorage');
const { createKeypair } = require('../utils/solana');

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
    
    // Initialize storage
    fileStorage.initializeStorage();
    
    // Check for available rewards
    const rewardsInfo = await checkAvailableRewards();
    
    if (!rewardsInfo.success) {
      logger.error(`Failed to check available rewards: ${rewardsInfo.error}`);
      return;
    }
    
    // Claim rewards
    const claimResult = await claimRewards();
    
    if (!claimResult.success) {
      logger.error(`Failed to claim rewards, aborting buyback: ${claimResult.error}`);
      return;
    }
    
    // Execute buyback
    const buybackResult = await executeBuyback(claimResult.amount, claimResult.rewardId);
    
    if (!buybackResult.success) {
      logger.error(`Failed to execute buyback, aborting process: ${buybackResult.error}`);
      return;
    }
    
    // Burn tokens - UPDATED: Pass the buyback transaction signature
    const burnResult = await burnBuybackTokens(
      createKeypair(),                    // Keypair parameter
      buybackResult.tokenAmount,          // Amount of tokens to burn
      process.env.TOKEN_ADDRESS,          // Token address 
      claimResult.rewardId,               // Reward ID
      buybackResult.solAmount,            // SOL amount spent
      claimResult.amountUsd,              // USD amount
      buybackResult.txSignature           // ADDED: Buyback transaction signature
    );
    
    if (!burnResult.success) {
      logger.error(`Failed to burn tokens: ${burnResult.error}`);
      return;
    }
    
    logger.info(`Complete buyback and burn process successful! Buyback tx: ${buybackResult.txSignature}, Burn tx: ${burnResult.signature}`);
    
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
  checkAvailableRewards,
  claimRewards,
  executeBuyback,
  burnBuybackTokens,
  performBuybackAndBurn,
  startBuybackMonitoring,
  config
};