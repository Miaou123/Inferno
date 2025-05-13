/**
 * Initialization script for $INFERNO token project
 * This script initializes the data files and prepares the system for operation
 */
const fs = require('fs');
const path = require('path');
const { BURN_SCHEDULE } = require('./src/scripts/milestone/burnConfig');
require('dotenv').config();

// Base directory for data storage
const DATA_DIR = path.join(__dirname, 'data');

// File paths for different data types
const FILES = {
  burns: path.join(DATA_DIR, 'burns.json'),
  metrics: path.join(DATA_DIR, 'metrics.json'),
  milestones: path.join(DATA_DIR, 'milestones.json'),
  rewards: path.join(DATA_DIR, 'rewards.json')
};

// Initialize the storage files
const initialize = async () => {
  try {
    console.log('Initializing data files...');
    
    // Ensure data directory exists
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    
    // Check if milestones file exists
    if (!fs.existsSync(FILES.milestones)) {
      console.log('Creating milestones data file...');
      
      const milestoneData = BURN_SCHEDULE.map((milestone, index) => ({
        id: `milestone-${milestone.marketCap}`,
        marketCap: milestone.marketCap,
        burnAmount: milestone.burnAmount,
        percentOfSupply: milestone.percentOfSupply,
        completed: false
      }));
      
      fs.writeFileSync(FILES.milestones, JSON.stringify(milestoneData, null, 2));
      console.log(`✓ Created milestones file with ${milestoneData.length} milestones`);
    } else {
      console.log(`✓ Milestones file already exists`);
    }
    
    // Initialize metrics file if it doesn't exist
    if (!fs.existsSync(FILES.metrics)) {
      console.log('Creating metrics data file...');
      
      const initialSupply = Number(process.env.INITIAL_SUPPLY) || 1000000000;
      const reserveWalletPercentage = 0.3; // 30%
      
      const initialMetrics = [{
        id: `initial-metrics`,
        timestamp: new Date().toISOString(),
        totalSupply: initialSupply,
        circulatingSupply: initialSupply * (1 - reserveWalletPercentage),
        reserveWalletBalance: initialSupply * reserveWalletPercentage,
        totalBurned: 0,
        buybackBurned: 0,
        milestoneBurned: 0,
        marketCap: 0
      }];
      
      fs.writeFileSync(FILES.metrics, JSON.stringify(initialMetrics, null, 2));
      console.log('✓ Created metrics file with initial data');
    } else {
      console.log(`✓ Metrics file already exists`);
    }
    
    // Create empty burns file if it doesn't exist
    if (!fs.existsSync(FILES.burns)) {
      console.log('Creating burns data file...');
      fs.writeFileSync(FILES.burns, JSON.stringify([], null, 2));
      console.log('✓ Created empty burns file');
    } else {
      console.log(`✓ Burns file already exists`);
    }
    
    // Create empty rewards file if it doesn't exist
    if (!fs.existsSync(FILES.rewards)) {
      console.log('Creating rewards data file...');
      fs.writeFileSync(FILES.rewards, JSON.stringify([], null, 2));
      console.log('✓ Created empty rewards file');
    } else {
      console.log(`✓ Rewards file already exists`);
    }
    
    console.log('\nInitialization complete! The system is ready to run.');
    console.log('\nNext steps:');
    console.log('1. Start the buyback script: npm run buyback');
    console.log('2. Start the milestone monitoring script: npm run milestone');
    console.log('3. Start the API server: npm run start-api');
    console.log('4. Or start all components: npm run start-all');
    
  } catch (error) {
    console.error('Error during initialization:', error);
    process.exit(1);
  }
};

// Run initialization if this file is executed directly
if (require.main === module) {
  initialize().catch(console.error);
}

module.exports = initialize;