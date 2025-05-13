/**
 * Milestone Burn Script for $INFERNO token
 * Monitors market cap and executes burns at predefined milestones
 */
const cron = require('node-cron');
const { 
  BURN_SCHEDULE,
  getNextMilestone,
  getPendingMilestones 
} = require('./burnConfig');
const { getMarketCap } = require('../utils/priceOracle');
const { 
  getReserveWalletKeypair,
  burnTokens 
} = require('../utils/solana');
const logger = require('../utils/logger').milestone;
const fileStorage = require('../utils/fileStorage');
require('dotenv').config();

// Initialize storage on startup
const initializeStorage = async () => {
  try {
    // Initialize storage files
    fileStorage.initializeStorage();
    
    // Check if initial metrics exist
    const metrics = fileStorage.findRecords('metrics');
    
    if (metrics.length === 0) {
      // Create initial metrics record
      const initialSupply = Number(process.env.INITIAL_SUPPLY) || 1000000000;
      const reserveWalletPercentage = 0.3; // 30%
      
      fileStorage.saveRecord('metrics', {
        timestamp: new Date().toISOString(),
        totalSupply: initialSupply,
        circulatingSupply: initialSupply * (1 - reserveWalletPercentage),
        reserveWalletBalance: initialSupply * reserveWalletPercentage,
        totalBurned: 0,
        buybackBurned: 0,
        milestoneBurned: 0,
        marketCap: 0
      });
      
      logger.info('Initialized metrics in storage');
    }
    
    logger.info('Storage initialization complete');
  } catch (error) {
    logger.error('Error initializing storage:', error);
    throw error;
  }
};

/**
 * Check if any milestones have been reached but not executed
 */
const checkMilestones = async () => {
  try {
    logger.info('Checking for pending milestones');
    
    // Get current market cap
    const currentMarketCap = await getMarketCap();
    logger.info(`Current market cap: $${currentMarketCap.toLocaleString()}`);
    
    // Get incomplete milestones from storage
    const milestones = fileStorage.readData(fileStorage.FILES.milestones);
    const incompleteMilestones = milestones
      .filter(m => !m.completed && currentMarketCap >= m.marketCap)
      .sort((a, b) => a.marketCap - b.marketCap);
    
    if (incompleteMilestones.length === 0) {
      logger.info('No pending milestones found');
      return;
    }
    
    logger.info(`Found ${incompleteMilestones.length} pending milestones to execute`);
    
    // Process each milestone in sequence
    for (const milestone of incompleteMilestones) {
      await executeMilestoneBurn(milestone, currentMarketCap);
    }
  } catch (error) {
    logger.error('Error checking milestones:', error);
  }
};

/**
 * Execute a milestone burn
 * @param {Object} milestone - Milestone object from storage
 * @param {Number} currentMarketCap - Current market cap in USD
 */
const executeMilestoneBurn = async (milestone, currentMarketCap) => {
  logger.info(`Executing milestone burn for $${milestone.marketCap.toLocaleString()} market cap`);
  logger.info(`Burn amount: ${milestone.burnAmount.toLocaleString()} tokens (${milestone.percentOfSupply}% of supply)`);
  
  try {
    // Get reserve wallet keypair
    const reserveKeypair = getReserveWalletKeypair();
    
    // Execute the burn transaction
    const burnResult = await burnTokens(
      reserveKeypair,
      milestone.burnAmount
    );
    
    if (!burnResult.success) {
      logger.error(`Failed to execute milestone burn: ${burnResult.error}`);
      return;
    }
    
    logger.info(`Burn successful with transaction signature: ${burnResult.signature}`);
    
    // Create burn record in storage
    const burnRecord = {
      burnType: 'milestone',
      amount: milestone.burnAmount,
      txSignature: burnResult.signature,
      initiator: 'milestone-script',
      marketCapAtBurn: currentMarketCap,
      milestone: milestone.marketCap,
      timestamp: new Date().toISOString(),
      details: {
        milestoneName: `$${milestone.marketCap.toLocaleString()} Market Cap`,
        percentOfSupply: milestone.percentOfSupply
      }
    };
    
    fileStorage.saveRecord('burns', burnRecord);
    
    // Update milestone as completed
    const milestones = fileStorage.readData(fileStorage.FILES.milestones);
    const updatedMilestones = milestones.map(m => {
      if (m.id === milestone.id) {
        return {
          ...m,
          completed: true,
          txSignature: burnResult.signature,
          completedAt: new Date().toISOString(),
          burnId: burnRecord.id
        };
      }
      return m;
    });
    
    fileStorage.writeData(fileStorage.FILES.milestones, updatedMilestones);
    
    // Update metrics
    await updateMetrics(milestone.burnAmount);
    
    logger.info(`Milestone burn for $${milestone.marketCap.toLocaleString()} completed successfully`);
    
    // Send notification (optional)
    sendBurnNotification(milestone, burnResult.signature);
  } catch (error) {
    logger.error(`Error executing milestone burn: ${error}`);
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
        circulatingSupply: initialSupply - burnAmount - (initialSupply * 0.3 - burnAmount), // Adjust based on reserve wallet
        reserveWalletBalance: initialSupply * 0.3 - burnAmount,
        totalBurned: burnAmount,
        buybackBurned: 0,
        milestoneBurned: burnAmount
      };
      
      fileStorage.saveRecord('metrics', newMetrics);
      return;
    }
    
    // Create new metrics entry
    const newMetrics = {
      timestamp: new Date().toISOString(),
      totalSupply: latestMetrics.totalSupply - burnAmount,
      circulatingSupply: latestMetrics.circulatingSupply,
      reserveWalletBalance: latestMetrics.reserveWalletBalance - burnAmount,
      totalBurned: latestMetrics.totalBurned + burnAmount,
      buybackBurned: latestMetrics.buybackBurned,
      milestoneBurned: latestMetrics.milestoneBurned + burnAmount,
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
 * Send notification about a milestone burn
 * @param {Object} milestone - Milestone object
 * @param {String} txSignature - Transaction signature
 */
const sendBurnNotification = (milestone, txSignature) => {
  try {
    // Check if notification channels are configured
    if (!process.env.DISCORD_WEBHOOK_URL && !process.env.TELEGRAM_BOT_TOKEN) {
      logger.info('No notification channels configured, skipping notification');
      return;
    }
    
    const message = `🔥 $INFERNO MILESTONE BURN EXECUTED 🔥\n\nMilestone: $${milestone.marketCap.toLocaleString()} Market Cap\nBurned: ${milestone.burnAmount.toLocaleString()} tokens (${milestone.percentOfSupply}% of supply)\nTransaction: https://solscan.io/tx/${txSignature}`;
    
    // Send Discord notification if configured
    if (process.env.DISCORD_WEBHOOK_URL) {
      // TODO: Implement Discord webhook notification
      logger.info('Discord notification would be sent here');
    }
    
    // Send Telegram notification if configured
    if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
      // TODO: Implement Telegram notification
      logger.info('Telegram notification would be sent here');
    }
  } catch (error) {
    logger.error(`Error sending notification: ${error}`);
  }
};

/**
 * Start the milestone monitoring process
 */
const startMilestoneMonitoring = async () => {
  try {
    // Initialize storage
    await initializeStorage();
    
    // Run initial check
    await checkMilestones();
    
    // Schedule regular checks (every 15 minutes)
    cron.schedule('*/15 * * * *', async () => {
      logger.info('Running scheduled milestone check');
      await checkMilestones();
    });
    
    logger.info('Milestone monitoring started successfully');
  } catch (error) {
    logger.error(`Error starting milestone monitoring: ${error}`);
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
  startMilestoneMonitoring();
}

// Export functions for testing and importing
module.exports = {
  checkMilestones,
  executeMilestoneBurn,
  updateMetrics,
  startMilestoneMonitoring
};