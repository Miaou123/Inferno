/**
 * Manual metrics update script for $INFERNO token
 * Updates the system to reflect actual token supply, burns, and reserve wallet balance
 */
const fileStorage = require('./utils/fileStorage');
const { getTokenBalance } = require('./utils/solana');
const logger = require('./utils/logger');
require('dotenv').config();

async function updateMetrics() {
  try {
    logger.info('Initializing file storage');
    fileStorage.initializeStorage();
    
    logger.info('Updating metrics with actual token data');
    
    // Get actual reserve wallet balance
    const reserveWalletAddress = process.env.RESERVE_WALLET_ADDRESS || process.env.SOLANA_PUBLIC_KEY;
    const tokenAddress = process.env.TOKEN_ADDRESS;
    let reserveWalletBalance = 0;
    
    try {
      reserveWalletBalance = await getTokenBalance(reserveWalletAddress, tokenAddress);
      logger.info(`Reserve wallet balance: ${reserveWalletBalance.toLocaleString()} tokens`);
    } catch (error) {
      logger.warn(`Failed to fetch reserve wallet balance: ${error.message}. Using 0.`);
    }
    
    // Get burn history
    const burns = fileStorage.readData(fileStorage.FILES.burns);
    const totalBurned = burns.reduce((sum, burn) => sum + (burn.amount || 0), 0);
    const buybackBurned = burns
      .filter(burn => burn.burnType === 'buyback')
      .reduce((sum, burn) => sum + (burn.amount || 0), 0);
    const milestoneBurned = burns
      .filter(burn => burn.burnType === 'milestone')
      .reduce((sum, burn) => sum + (burn.amount || 0), 0);
    
    logger.info(`Total burned: ${totalBurned.toLocaleString()} tokens`);
    logger.info(`Buyback burned: ${buybackBurned.toLocaleString()} tokens`);
    logger.info(`Milestone burned: ${milestoneBurned.toLocaleString()} tokens`);
    
    // Get initial supply from env
    const initialSupply = Number(process.env.INITIAL_SUPPLY) || 1000000000;
    
    // Calculate circulating supply
    const circulatingSupply = initialSupply - totalBurned - reserveWalletBalance;
    
    // Create new metrics record
    const newMetrics = {
      timestamp: new Date().toISOString(),
      totalSupply: initialSupply - totalBurned,
      circulatingSupply,
      reserveWalletBalance,
      totalBurned,
      buybackBurned,
      milestoneBurned,
      tokenAddress
    };
    
    // Save the new metrics
    fileStorage.saveRecord('metrics', newMetrics);
    
    logger.info('Metrics updated successfully');
    logger.info(`Total Supply: ${newMetrics.totalSupply.toLocaleString()}`);
    logger.info(`Circulating Supply: ${newMetrics.circulatingSupply.toLocaleString()}`);
    logger.info(`Reserve Wallet: ${newMetrics.reserveWalletBalance.toLocaleString()}`);
    
    return newMetrics;
  } catch (error) {
    logger.error(`Error updating metrics: ${error.message}`);
    throw error;
  }
}

// Run the update if called directly
if (require.main === module) {
  updateMetrics()
    .then(() => {
      logger.info('Metrics update completed');
      process.exit(0);
    })
    .catch(error => {
      logger.error(`Metrics update failed: ${error.message}`);
      process.exit(1);
    });
}

module.exports = { updateMetrics };