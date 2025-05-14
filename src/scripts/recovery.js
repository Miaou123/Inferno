/**
 * Recovery Script for $INFERNO token
 * Handles recovery from failed burns and verifies system integrity
 */
const cron = require('node-cron');
const { runFullRecovery } = require('./utils/recovery');
const { updateReserveMetrics } = require('./utils/updateReserveMetrics');
const logger = require('./utils/logger').recovery;
const fileStorage = require('./utils/fileStorage');
require('dotenv').config();

/**
 * Run a manual recovery process
 */
const runManualRecovery = async () => {
  try {
    logger.info('Starting manual recovery process');
    
    // Make sure storage is initialized
    fileStorage.initializeStorage();
    
    // Run the full recovery process
    const results = await runFullRecovery();
    
    // Log the results
    logger.info('Recovery process completed:');
    
    if (results.verifyReserveBalance?.success) {
      const { expectedBalance, actualBalance, discrepancy, correctionNeeded } = results.verifyReserveBalance;
      logger.info(`Reserve balance check: Expected ${expectedBalance.toLocaleString()}, Actual ${actualBalance.toLocaleString()}, Discrepancy ${discrepancy.toLocaleString()}`);
      if (correctionNeeded) {
        logger.info('Metrics updated with corrected reserve balance');
      }
    } else {
      logger.warn(`Reserve balance check failed: ${results.verifyReserveBalance?.error || 'Unknown error'}`);
    }
    
    const milestoneBurns = results.recoverMilestoneBurns;
    logger.info(`Milestone burn recovery: ${milestoneBurns.recovered} succeeded, ${milestoneBurns.failures} failed`);
    
    const buybackBurns = results.recoverBuybackBurns;
    logger.info(`Buyback burn recovery: ${buybackBurns.recovered} succeeded, ${buybackBurns.failures} failed`);
    
    return results;
  } catch (error) {
    logger.error(`Error in manual recovery process: ${error}`);
    throw error;
  }
};

/**
 * Start an automated recovery process that runs daily
 */
const startScheduledRecovery = async () => {
  try {
    logger.info('Starting scheduled recovery monitoring');
    
    // Initialize storage
    fileStorage.initializeStorage();
    
    // Create a record to track recovery runs
    fileStorage.saveRecord('recoveryRuns', {
      type: 'scheduled-startup',
      timestamp: new Date().toISOString(),
      status: 'started'
    });
    
    // Run an initial recovery
    logger.info('Running initial recovery check');
    const initialResults = await runFullRecovery();
    
    // Schedule daily recovery check (at 3:00 AM)
    cron.schedule('0 3 * * *', async () => {
      logger.info('Running scheduled daily recovery check');
      
      // Create a record for this recovery run
      const runRecord = fileStorage.saveRecord('recoveryRuns', {
        type: 'scheduled-daily',
        timestamp: new Date().toISOString(),
        status: 'started'
      });
      
      try {
        // Run the recovery
        const results = await runFullRecovery();
        
        // Update reserve metrics with actual on-chain data
        logger.info('Updating reserve wallet metrics with actual on-chain data');
        const metricsUpdate = await updateReserveMetrics();
        
        // Update the record with results
        fileStorage.updateRecord('recoveryRuns', runRecord.id, {
          status: 'completed',
          results,
          metricsUpdate,
          completedAt: new Date().toISOString()
        });
      } catch (error) {
        logger.error(`Error in scheduled recovery: ${error}`);
        
        // Update the record with error
        fileStorage.updateRecord('recoveryRuns', runRecord.id, {
          status: 'failed',
          error: error.message,
          failedAt: new Date().toISOString()
        });
      }
    });
    
    // Also run a more frequent check (every 4 hours) just for reserve metrics
    cron.schedule('0 */4 * * *', async () => {
      logger.info('Running periodic reserve metric update');
      
      try {
        // Update reserve metrics with actual on-chain data
        const result = await updateReserveMetrics();
        
        if (result.success && result.updated) {
          logger.info(`Successfully updated reserve metrics. New reserve: ${result.newBalance.toLocaleString()} tokens (${(result.newPercentage * 100).toFixed(2)}%)`);
        } else if (result.success) {
          logger.info('No significant changes in reserve metrics');
        } else {
          logger.warn(`Failed to update reserve metrics: ${result.error}`);
        }
      } catch (error) {
        logger.error(`Error updating reserve metrics: ${error.message}`);
      }
    });
    
    logger.info('Scheduled recovery monitoring started successfully');
    return initialResults;
  } catch (error) {
    logger.error(`Error starting scheduled recovery: ${error}`);
    throw error;
  }
};

// Handle graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully');
  process.exit(0);
});

// Start the script if it's run directly
if (require.main === module) {
  // Check command line arguments
  const scheduledMode = process.argv.includes('--scheduled');
  const verifyOnly = process.argv.includes('--verify-only');
  
  if (scheduledMode) {
    // Start scheduled recovery
    startScheduledRecovery().catch(error => {
      logger.error(`Failed to start scheduled recovery: ${error}`);
      process.exit(1);
    });
  } else if (verifyOnly) {
    // Just run the reserve metrics verification
    updateReserveMetrics().then(result => {
      if (result.success) {
        if (result.updated) {
          logger.info(`Reserve metrics updated: ${result.newBalance.toLocaleString()} tokens (${(result.newPercentage * 100).toFixed(2)}%)`);
        } else {
          logger.info(`Reserve metrics verified: ${result.currentBalance.toLocaleString()} tokens (${(result.currentPercentage * 100).toFixed(2)}%)`);
        }
        process.exit(0);
      } else {
        logger.error(`Failed to verify reserve metrics: ${result.error}`);
        process.exit(1);
      }
    }).catch(error => {
      logger.error(`Error verifying reserve metrics: ${error}`);
      process.exit(1);
    });
  } else {
    // Run manual recovery
    runManualRecovery().then(results => {
      logger.info('Manual recovery completed successfully');
      
      // Also update reserve metrics after recovery
      return updateReserveMetrics().then(metricsResult => {
        if (metricsResult.success && metricsResult.updated) {
          logger.info(`Also updated reserve metrics to: ${metricsResult.newBalance.toLocaleString()} tokens (${(metricsResult.newPercentage * 100).toFixed(2)}%)`);
        }
        process.exit(0);
      });
    }).catch(error => {
      logger.error(`Failed to run manual recovery: ${error}`);
      process.exit(1);
    });
  }
}

module.exports = {
  runManualRecovery,
  startScheduledRecovery
};