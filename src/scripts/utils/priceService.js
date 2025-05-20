// priceService.js
const { fetchFromDexScreener } = require('./utils/priceOracle');
const cron = require('node-cron');

// Start the price update service
const startPriceService = () => {
  console.log('Starting price update service');
  
  // Run every minute
  cron.schedule('* * * * *', async () => {
    try {
      await fetchFromDexScreener();
    } catch (error) {
      console.error(`Price update failed: ${error.message}`);
    }
  });
  
  // Initial fetch
  fetchFromDexScreener().catch(err => console.error('Initial fetch failed:', err));
};

// Run if this file is executed directly
if (require.main === module) {
  startPriceService();
}

module.exports = { startPriceService };