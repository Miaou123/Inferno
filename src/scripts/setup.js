/**
 * Initial setup script for $INFERNO token
 * 
 * This script:
 * 1. Creates the token on pump.fun
 * 2. Makes the initial creator buy
 * 3. Buys the reserve allocation
 * 4. Updates the project configuration with token details
 * 5. Initializes all the required data structures
 */
const { setupInfernoToken } = require('./utils/tokenCreation');
const fileStorage = require('./utils/fileStorage');
const logger = require('./utils/logger').setup;
require('dotenv').config();

async function main() {
  try {
    logger.info('===============================================');
    logger.info('Starting $INFERNO token project setup');
    logger.info('===============================================');
    
    // Initialize storage
    logger.info('Initializing data storage');
    fileStorage.initializeStorage();
    
    // Check if token is already set up
    const existingSetup = fileStorage.findRecords('tokenSetup', record => record.setupCompleted === true);
    
    if (existingSetup.length > 0) {
      logger.info(`Token already set up at address: ${existingSetup[0].tokenAddress}`);
      logger.info(`Setup completed on: ${existingSetup[0].completedAt}`);
      logger.info('To force a new setup, delete the tokenSetup record in data/tokenSetup.json');
      return;
    }
    
    // Set up token
    logger.info('Creating new token on pump.fun');
    const result = await setupInfernoToken();
    
    if (!result.success) {
      throw new Error(`Setup failed: ${result.error}`);
    }
    
    const { tokenAddress } = result.setupDetails;
    
    // Initialize metrics with initial supply
    const initialSupply = Number(process.env.INITIAL_SUPPLY) || 1000000000;
    const reservePercent = 0.3; // 30% reserve
    
    // Create initial metrics
    const initialMetrics = {
      timestamp: new Date().toISOString(),
      totalSupply: initialSupply,
      circulatingSupply: initialSupply * (1 - reservePercent),
      reserveWalletBalance: initialSupply * reservePercent,
      totalBurned: 0,
      buybackBurned: 0,
      milestoneBurned: 0,
      tokenAddress
    };
    
    fileStorage.saveRecord('metrics', initialMetrics);
    
    // Initialize milestones based on README schedule
    const milestones = [
      { mcap: 100000, amount: 50000000, percent: 5.00, status: 'pending' },
      { mcap: 200000, amount: 25000000, percent: 2.50, status: 'pending' },
      { mcap: 300000, amount: 20000000, percent: 2.00, status: 'pending' },
      { mcap: 500000, amount: 20000000, percent: 2.00, status: 'pending' },
      { mcap: 750000, amount: 15000000, percent: 1.50, status: 'pending' },
      { mcap: 1000000, amount: 15000000, percent: 1.50, status: 'pending' },
      { mcap: 1500000, amount: 12500000, percent: 1.25, status: 'pending' },
      { mcap: 2500000, amount: 12500000, percent: 1.25, status: 'pending' },
      { mcap: 3500000, amount: 10000000, percent: 1.00, status: 'pending' },
      { mcap: 5000000, amount: 10000000, percent: 1.00, status: 'pending' },
      { mcap: 7500000, amount: 10000000, percent: 1.00, status: 'pending' },
      { mcap: 10000000, amount: 10000000, percent: 1.00, status: 'pending' },
      { mcap: 15000000, amount: 7500000, percent: 0.75, status: 'pending' },
      { mcap: 25000000, amount: 7500000, percent: 0.75, status: 'pending' },
      { mcap: 35000000, amount: 5000000, percent: 0.50, status: 'pending' },
      { mcap: 50000000, amount: 5000000, percent: 0.50, status: 'pending' },
      { mcap: 75000000, amount: 7500000, percent: 0.75, status: 'pending' },
      { mcap: 90000000, amount: 7500000, percent: 0.75, status: 'pending' },
      { mcap: 100000000, amount: 50000000, percent: 5.00, status: 'pending' }
    ];
    
    // Add milestones to storage
    milestones.forEach(milestone => {
      fileStorage.saveRecord('milestones', {
        ...milestone,
        createdAt: new Date().toISOString()
      });
    });
    
    logger.info('===============================================');
    logger.info('$INFERNO TOKEN SETUP COMPLETED SUCCESSFULLY');
    logger.info(`Token Address: ${tokenAddress}`);
    logger.info(`Initial Supply: ${initialSupply}`);
    logger.info(`Reserve Balance: ${initialMetrics.reserveWalletBalance} (${reservePercent*100}%)`);
    logger.info(`Circulating Supply: ${initialMetrics.circulatingSupply}`);
    logger.info('===============================================');
    logger.info('Next steps:');
    logger.info('1. Start the buyback script: npm run buyback');
    logger.info('2. Start the milestone monitoring script: npm run milestone');
    logger.info('3. Start the rewards claim script: npm run rewards');
    logger.info('===============================================');
    
  } catch (error) {
    logger.error(`Setup failed: ${error}`);
    process.exit(1);
  }
}

// Run setup if directly executed
if (require.main === module) {
  main().catch(console.error);
}

module.exports = main;