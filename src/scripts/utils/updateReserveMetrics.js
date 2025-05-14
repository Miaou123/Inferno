/**
 * Utility for updating reserve wallet metrics
 * Ensures the system always uses accurate reserve percentages
 */
const { getTokenBalance } = require('./solana');
const fileStorage = require('./fileStorage');
const logger = require('./logger').recovery;
require('dotenv').config();

/**
 * Update reserve wallet metrics with actual on-chain data
 * @returns {Promise<Object>} Update result
 */
const updateReserveMetrics = async () => {
  try {
    logger.info('Updating reserve wallet metrics');
    
    // Get wallet address from env
    const walletAddress = process.env.SOLANA_PUBLIC_KEY;
    const tokenAddress = process.env.TOKEN_ADDRESS;
    
    if (!walletAddress || !tokenAddress) {
      logger.error('Missing wallet or token address, cannot update reserve metrics');
      return {
        success: false,
        error: 'MISSING_ADDRESS'
      };
    }
    
    // Get current metrics
    const metrics = fileStorage.findRecords('metrics', () => true, { 
      sort: { field: 'timestamp', order: 'desc' }, 
      limit: 1 
    });
    
    if (metrics.length === 0) {
      logger.error('No existing metrics found, cannot update reserve metrics');
      return {
        success: false,
        error: 'NO_METRICS_FOUND'
      };
    }
    
    const latestMetrics = metrics[0];
    
    try {
      // Get actual reserve wallet balance
      const reserveWalletBalance = await getTokenBalance(walletAddress, tokenAddress);
      const actualReservePercentage = reserveWalletBalance / latestMetrics.totalSupply;
      
      logger.info(`Current reserve: ${reserveWalletBalance.toLocaleString()} tokens (${(actualReservePercentage * 100).toFixed(2)}%)`);
      logger.info(`Previous reserve: ${latestMetrics.reserveWalletBalance.toLocaleString()} tokens (${(latestMetrics.reservePercentage * 100).toFixed(2)}%)`);
      
      // Check if there's a significant difference
      const balanceDifference = Math.abs(reserveWalletBalance - latestMetrics.reserveWalletBalance);
      const percentageDifference = Math.abs(actualReservePercentage - latestMetrics.reservePercentage);
      
      if (balanceDifference > 1000 || percentageDifference > 0.001) {
        // Create new metrics record with updated values
        const newMetrics = {
          ...latestMetrics,
          timestamp: new Date().toISOString(),
          reserveWalletBalance,
          reservePercentage: actualReservePercentage,
          // Recalculate circulating supply based on actual balance
          circulatingSupply: latestMetrics.totalSupply - reserveWalletBalance,
          balanceUpdated: true,
          previousReserveBalance: latestMetrics.reserveWalletBalance,
          previousReservePercentage: latestMetrics.reservePercentage,
          updateReason: 'periodic-check'
        };
        
        // Save to storage
        fileStorage.saveRecord('metrics', newMetrics);
        
        logger.info(`Updated reserve metrics with actual on-chain data (${(actualReservePercentage * 100).toFixed(2)}%)`);
        
        return {
          success: true,
          updated: true,
          newBalance: reserveWalletBalance,
          newPercentage: actualReservePercentage,
          balanceDifference,
          percentageDifference
        };
      } else {
        logger.info('No significant change in reserve balance, skipping update');
        return {
          success: true,
          updated: false,
          currentBalance: reserveWalletBalance,
          currentPercentage: actualReservePercentage
        };
      }
    } catch (error) {
      logger.error(`Error getting token balance: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  } catch (error) {
    logger.error(`Error updating reserve metrics: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
};

module.exports = {
  updateReserveMetrics
};