/**
 * Metrics utilities for $INFERNO token
 * Part of the buyback system
 */
const fileStorage = require('../../utils/fileStorage');
const logger = require('../../utils/logger').buyback;
require('dotenv').config();

/**
 * Get the latest metrics from storage
 * @returns {Object|null} Latest metrics or null if none exist
 */
const getLatestMetrics = () => {
  const metrics = fileStorage.findRecords('metrics', () => true, { 
    sort: { field: 'timestamp', order: 'desc' }, 
    limit: 1 
  });
  
  return metrics.length > 0 ? metrics[0] : null;
};

/**
 * Create initial metrics when none exist
 * @param {Number} burnAmount - Amount of tokens burned
 * @returns {Object} Created metrics record
 */
const createInitialMetrics = (burnAmount) => {
  const initialSupply = Number(process.env.INITIAL_SUPPLY) || 1000000000;
  const reservePercentage = 0.3; // Default 30% reserve
  
  const newMetrics = {
    timestamp: new Date().toISOString(),
    totalSupply: initialSupply - burnAmount,
    circulatingSupply: initialSupply - burnAmount - (initialSupply * reservePercentage),
    reserveWalletBalance: initialSupply * reservePercentage,
    totalBurned: burnAmount,
    buybackBurned: burnAmount,
    milestoneBurned: 0
  };
  
  return fileStorage.saveRecord('metrics', newMetrics);
};

/**
 * Calculate updated metrics based on current metrics and new burn
 * @param {Object} latestMetrics - Current metrics
 * @param {Number} burnAmount - Amount of tokens burned
 * @returns {Object} Updated metrics
 */
const calculateUpdatedMetrics = (latestMetrics, burnAmount) => {
  return {
    timestamp: new Date().toISOString(),
    totalSupply: latestMetrics.totalSupply - burnAmount,
    circulatingSupply: latestMetrics.circulatingSupply - burnAmount,
    reserveWalletBalance: latestMetrics.reserveWalletBalance,
    totalBurned: latestMetrics.totalBurned + burnAmount,
    buybackBurned: (latestMetrics.buybackBurned || 0) + burnAmount,
    milestoneBurned: latestMetrics.milestoneBurned || 0,
    priceInSol: latestMetrics.priceInSol,
    priceInUsd: latestMetrics.priceInUsd,
    marketCap: latestMetrics.marketCap
  };
};

/**
 * Update token metrics after a buyback burn
 * @param {Number} burnAmount - Amount of tokens burned
 * @returns {Promise<Object>} Updated metrics
 */
const updateMetricsAfterBurn = async (burnAmount) => {
  try {
    logger.info(`Updating metrics after buyback burn of ${burnAmount} tokens`);
    
    // Get current metrics
    const latestMetrics = getLatestMetrics();
    
    // If no metrics exist, create a new baseline
    if (!latestMetrics) {
      logger.info('No existing metrics found, creating initial metrics');
      return createInitialMetrics(burnAmount);
    }
    
    // Create new metrics entry
    const newMetrics = calculateUpdatedMetrics(latestMetrics, burnAmount);
    
    // Save updated metrics
    const savedMetrics = fileStorage.saveRecord('metrics', newMetrics);
    
    logger.info('Metrics updated successfully after buyback burn');
    return savedMetrics;
  } catch (error) {
    logger.error(`Error updating metrics: ${error.message}`);
    throw error;
  }
};

module.exports = {
  getLatestMetrics,
  updateMetricsAfterBurn
};