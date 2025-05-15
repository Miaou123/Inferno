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
 * @param {String} burnType - Type of burn ('buyback' or 'milestone')
 * @returns {Object} Created metrics record
 */
const createInitialMetrics = (burnAmount, burnType) => {
  const initialSupply = Number(process.env.INITIAL_SUPPLY) || 1000000000;
  const reservePercentage = 0.3; // Default 30% reserve
  
  const newMetrics = {
    timestamp: new Date().toISOString(),
    totalSupply: initialSupply - burnAmount,
    circulatingSupply: burnType === 'buyback' 
      ? initialSupply - burnAmount - (initialSupply * reservePercentage)
      : initialSupply - (initialSupply * reservePercentage),
    reserveWalletBalance: burnType === 'milestone'
      ? initialSupply * reservePercentage - burnAmount
      : initialSupply * reservePercentage,
    totalBurned: burnAmount,
    buybackBurned: burnType === 'buyback' ? burnAmount : 0,
    milestoneBurned: burnType === 'milestone' ? burnAmount : 0
  };
  
  return fileStorage.saveRecord('metrics', newMetrics);
};

/**
 * Calculate updated metrics based on current metrics and new burn
 * @param {Object} latestMetrics - Current metrics
 * @param {Number} burnAmount - Amount of tokens burned
 * @param {String} burnType - Type of burn ('buyback' or 'milestone')
 * @returns {Object} Updated metrics
 */
const calculateUpdatedMetrics = (latestMetrics, burnAmount, burnType) => {
  return {
    timestamp: new Date().toISOString(),
    totalSupply: latestMetrics.totalSupply - burnAmount,
    circulatingSupply: burnType === 'buyback' 
      ? latestMetrics.circulatingSupply - burnAmount 
      : latestMetrics.circulatingSupply,
    reserveWalletBalance: burnType === 'milestone'
      ? latestMetrics.reserveWalletBalance - burnAmount
      : latestMetrics.reserveWalletBalance,
    totalBurned: latestMetrics.totalBurned + burnAmount,
    buybackBurned: burnType === 'buyback' 
      ? (latestMetrics.buybackBurned || 0) + burnAmount 
      : (latestMetrics.buybackBurned || 0),
    milestoneBurned: burnType === 'milestone' 
      ? (latestMetrics.milestoneBurned || 0) + burnAmount 
      : (latestMetrics.milestoneBurned || 0),
    priceInSol: latestMetrics.priceInSol,
    priceInUsd: latestMetrics.priceInUsd,
    marketCap: latestMetrics.marketCap
  };
};

/**
 * Update token metrics after a burn
 * @param {Number} burnAmount - Amount of tokens burned
 * @param {String} burnType - Type of burn ('buyback' or 'milestone')
 * @returns {Promise<Object>} Updated metrics
 */
const updateMetricsAfterBurn = async (burnAmount, burnType = 'buyback') => {
  try {
    logger.info(`Updating metrics after ${burnType} burn of ${burnAmount} tokens`);
    
    // Get current metrics
    const latestMetrics = getLatestMetrics();
    
    // If no metrics exist, create a new baseline
    if (!latestMetrics) {
      logger.info('No existing metrics found, creating initial metrics');
      return createInitialMetrics(burnAmount, burnType);
    }
    
    // Create new metrics entry
    const newMetrics = calculateUpdatedMetrics(latestMetrics, burnAmount, burnType);
    
    // Save updated metrics
    const savedMetrics = fileStorage.saveRecord('metrics', newMetrics);
    
    logger.info('Metrics updated successfully');
    return savedMetrics;
  } catch (error) {
    logger.error(`Error updating metrics: ${error}`);
    throw error;
  }
};

module.exports = {
  getLatestMetrics,
  createInitialMetrics,
  calculateUpdatedMetrics,
  updateMetricsAfterBurn
};