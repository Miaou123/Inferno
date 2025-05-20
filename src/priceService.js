/**
 * Centralized Price Service for $INFERNO token
 * Runs as a separate process to provide price data to all components
 */
const { fetchFromDexScreener, priceEvents } = require('./scripts/utils/priceOracle');
const cron = require('node-cron');
const logger = require('./scripts/utils/logger').price;
require('dotenv').config();

// Configure update interval
const PRICE_UPDATE_INTERVAL_MINUTES = 1;

logger.info('Starting centralized price service');

// Run initial price fetch
fetchFromDexScreener(true) // Force refresh
  .then(data => {
    logger.info(`Initial price fetch successful: $${data.tokenPriceInUsd.toFixed(8)} USD, MC: $${data.marketCap.toFixed(2)}`);
  })
  .catch(error => {
    logger.error(`Initial price fetch failed: ${error.message}`);
  });

// Schedule regular price updates
cron.schedule(`*/${PRICE_UPDATE_INTERVAL_MINUTES} * * * *`, async () => {
  try {
    logger.info('Running scheduled price update');
    const data = await fetchFromDexScreener(true); // Force refresh
    logger.info(`Scheduled price update completed: $${data.tokenPriceInUsd.toFixed(8)} USD, MC: $${data.marketCap.toFixed(2)}`);
  } catch (error) {
    logger.error(`Scheduled price update failed: ${error.message}`);
  }
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('Price service shutting down gracefully');
  process.exit(0);
});

// Log process events
process.on('uncaughtException', (error) => {
  logger.error(`Uncaught exception in price service: ${error.message}`);
  // Keep process running despite errors
});

logger.info(`Price service started successfully - updating every ${PRICE_UPDATE_INTERVAL_MINUTES} minute(s)`);