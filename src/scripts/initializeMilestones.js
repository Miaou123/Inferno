/**
 * Milestone initialization script for $INFERNO token
 * 
 * This script initializes the milestones.json file from your burnConfig.js
 * without relying on the potentially circular imports
 */
const fs = require('fs');
const path = require('path');
const winston = require('winston');
require('dotenv').config();

// Configure simple logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.printf(info => `${info.timestamp} [INFO] ${info.message}`)
  ),
  transports: [
    new winston.transports.Console()
  ]
});

// Milestone schedule - copied directly from your burnConfig.js
const BURN_SCHEDULE = [
  { marketCap: 4000, burnAmount: 10, percentOfSupply: 1.00 },
  { marketCap: 4500, burnAmount: 100, percentOfSupply: 1.00 },
  { marketCap: 5000, burnAmount: 10, percentOfSupply: 1.00 },
  { marketCap: 5500, burnAmount: 20, percentOfSupply: 1.50 },
  { marketCap: 7000, burnAmount: 15000000, percentOfSupply: 1.50 },
  { marketCap: 80000, burnAmount: 20000000, percentOfSupply: 2.00 },
  { marketCap: 90000, burnAmount: 20000000, percentOfSupply: 2.00 },
  { marketCap: 100000, burnAmount: 25000000, percentOfSupply: 2.50 },
  { marketCap: 120000, burnAmount: 25000000, percentOfSupply: 2.50 }
];

// Path to your data directory
const DATA_DIR = path.join(__dirname, '../../data');
const MILESTONES_FILE = path.join(DATA_DIR, 'milestones.json');

/**
 * Initialize milestones in the JSON file
 */
async function initializeMilestones() {
  try {
    logger.info('Starting milestone initialization');
    
    // Ensure data directory exists
    if (!fs.existsSync(DATA_DIR)) {
      logger.info(`Creating data directory: ${DATA_DIR}`);
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    
    // Check if milestones.json exists and is not empty
    let existingMilestones = [];
    if (fs.existsSync(MILESTONES_FILE)) {
      try {
        const fileContent = fs.readFileSync(MILESTONES_FILE, 'utf8');
        existingMilestones = JSON.parse(fileContent);
        logger.info(`Found ${existingMilestones.length} existing milestones in file`);
      } catch (error) {
        logger.info(`Error reading existing milestones: ${error.message}`);
        // If file exists but is corrupt, rename it for backup
        fs.renameSync(MILESTONES_FILE, `${MILESTONES_FILE}.backup-${Date.now()}`);
        existingMilestones = [];
      }
    }
    
    // Only initialize if there are no existing milestones
    if (existingMilestones.length === 0) {
      logger.info('No existing milestones found. Initializing from BURN_SCHEDULE');
      
      // Create milestone records
      const milestones = BURN_SCHEDULE.map(milestone => ({
        id: `milestone-${milestone.marketCap}`,
        marketCap: milestone.marketCap,
        burnAmount: milestone.burnAmount,
        percentOfSupply: milestone.percentOfSupply,
        completed: false,
        createdAt: new Date().toISOString()
      }));
      
      // Write to file
      fs.writeFileSync(MILESTONES_FILE, JSON.stringify(milestones, null, 2));
      
      logger.info(`Successfully initialized ${milestones.length} milestones in ${MILESTONES_FILE}`);
      
      // Log the first few milestones for verification
      milestones.slice(0, 3).forEach((m, i) => {
        logger.info(`Milestone #${i+1}: $${m.marketCap} market cap, ${m.burnAmount.toLocaleString()} tokens`);
      });
    } else {
      logger.info(`Milestones already initialized with ${existingMilestones.length} entries. No action needed.`);
    }
    
    logger.info('Milestone initialization complete');
  } catch (error) {
    logger.error(`Error initializing milestones: ${error.message}`);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  initializeMilestones();
}

module.exports = { initializeMilestones };