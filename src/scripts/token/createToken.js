/**
 * Token configuration for manually created $INFERNO token
 * This script sets up your environment with a token you've created manually
 */
const logger = require('../utils/logger');
const fileStorage = require('../utils/fileStorage');
require('dotenv').config();

/**
 * Set up the $INFERNO token configuration
 * @returns {Promise<Object>} Setup result
 */
async function setupInfernoToken() {
  try {
    logger.info('Starting $INFERNO token config setup');
    
    // Initialize storage
    fileStorage.initializeStorage();
    
    // Get token address from environment
    const tokenAddress = process.env.TOKEN_ADDRESS;
    
    if (!tokenAddress) {
      throw new Error('TOKEN_ADDRESS not found in environment. Please add it to your .env file');
    }
    
    logger.info(`Using token address: ${tokenAddress}`);
    
    // Save token setup details
    const setupDetails = {
      tokenAddress,
      setupCompleted: true,
      completedAt: new Date().toISOString(),
      manualSetup: true
    };
    
    fileStorage.saveRecord('tokenSetup', setupDetails);
    
    logger.info('$INFERNO token setup completed successfully!');
    
    return {
      success: true,
      setupDetails
    };
  } catch (error) {
    logger.error(`Error setting up token: ${error}`);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  setupInfernoToken
};