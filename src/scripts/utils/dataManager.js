/**
 * Data Management Utility for $INFERNO Token Project
 * Provides functions to clean data and regenerate test data
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Base directories
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const DATA_DIR = path.join(PROJECT_ROOT, 'data');
const BACKUPS_DIR = path.join(PROJECT_ROOT, 'backups');

// Simple console logger
const log = {
  info: (message) => console.log(`[INFO] ${message}`),
  warn: (message) => console.warn(`[WARN] ${message}`),
  error: (message) => console.error(`[ERROR] ${message}`),
  debug: (message) => console.log(`[DEBUG] ${message}`)
};

/**
 * Clean data and backups
 * @param {Object} options - Cleaning options
 * @param {boolean} options.cleanData - Whether to clean data files
 * @param {boolean} options.cleanBackups - Whether to clean backup directories
 * @param {boolean} options.keepLatestBackup - Whether to keep the latest backup
 * @param {boolean} options.preserveStructure - Whether to preserve directory structure
 * @returns {Promise<Object>} Cleaning results
 */
const cleanData = async (options = {}) => {
  const {
    cleanData = true,
    cleanBackups = true,
    keepLatestBackup = true,
    preserveStructure = true
  } = options;
  
  try {
    log.info('Starting data cleanup process');
    let results = {
      dataFilesRemoved: 0,
      dataFilesPreserved: 0,
      backupDirectoriesRemoved: 0,
      backupDirectoriesPreserved: 0,
      errors: []
    };
    
    // Clean data files
    if (cleanData) {
      log.info('Cleaning data files...');
      
      if (!fs.existsSync(DATA_DIR)) {
        log.warn('Data directory does not exist. Creating...');
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      
      const dataFiles = fs.readdirSync(DATA_DIR);
      
      for (const file of dataFiles) {
        const filePath = path.join(DATA_DIR, file);
        
        // Check if it's a file (not a directory)
        if (fs.statSync(filePath).isFile()) {
          try {
            if (preserveStructure) {
              // Keep the file but empty its contents
              fs.writeFileSync(filePath, '[]');
              log.info(`Emptied data file: ${file}`);
              results.dataFilesPreserved++;
            } else {
              // Remove the file
              fs.unlinkSync(filePath);
              log.info(`Removed data file: ${file}`);
              results.dataFilesRemoved++;
            }
          } catch (error) {
            log.error(`Error processing data file ${file}: ${error.message}`);
            results.errors.push({
              file,
              error: error.message
            });
          }
        }
      }
    }
    
    // Clean backup files
    if (cleanBackups) {
      log.info('Cleaning backup directories...');
      
      if (!fs.existsSync(BACKUPS_DIR)) {
        log.warn('Backups directory does not exist. Creating...');
        fs.mkdirSync(BACKUPS_DIR, { recursive: true });
        return results;
      }
      
      const backupDirs = fs.readdirSync(BACKUPS_DIR);
      
      // If we need to keep the latest backup and there are any backups
      if (keepLatestBackup && backupDirs.length > 0) {
        // Sort backup directories by name (timestamp-based) in descending order
        backupDirs.sort((a, b) => b.localeCompare(a));
        
        // Keep the first one (latest)
        const latestBackup = backupDirs.shift();
        log.info(`Preserving latest backup: ${latestBackup}`);
        results.backupDirectoriesPreserved++;
      }
      
      // Process remaining backup directories
      for (const dir of backupDirs) {
        const dirPath = path.join(BACKUPS_DIR, dir);
        
        // Check if it's a directory
        if (fs.statSync(dirPath).isDirectory()) {
          try {
            if (preserveStructure) {
              // Keep the directory but clean its contents
              log.info(`Preserving backup directory structure: ${dir}`);
              
              // Read all files in the backup directory
              const backupFiles = fs.readdirSync(dirPath);
              
              // Empty each file in the backup directory
              for (const file of backupFiles) {
                const filePath = path.join(dirPath, file);
                
                if (fs.statSync(filePath).isFile()) {
                  // Empty the file contents by writing an empty array
                  fs.writeFileSync(filePath, '[]');
                  log.debug(`Emptied backup file: ${dir}/${file}`);
                }
              }
              
              results.backupDirectoriesPreserved++;
            } else {
              // Remove the directory recursively
              fs.rmSync(dirPath, { recursive: true });
              log.info(`Removed backup directory: ${dir}`);
              results.backupDirectoriesRemoved++;
            }
          } catch (error) {
            log.error(`Error processing backup directory ${dir}: ${error.message}`);
            results.errors.push({
              directory: dir,
              error: error.message
            });
          }
        }
      }
    }
    
    log.info(`Data cleanup completed. Preserved: ${results.dataFilesPreserved} files, ${results.backupDirectoriesPreserved} backups. Removed: ${results.dataFilesRemoved} files, ${results.backupDirectoriesRemoved} backups. Errors: ${results.errors.length}`);
    return results;
  } catch (error) {
    log.error(`Error in cleanup process: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Create a backup of the current data
 * @returns {Promise<string>} Path to the backup directory
 */
const createDataBackup = async () => {
  try {
    const timestamp = Date.now();
    const backupDir = path.join(BACKUPS_DIR, `data_${timestamp}`);
    
    // Create backup directory
    if (!fs.existsSync(BACKUPS_DIR)) {
      fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    }
    
    fs.mkdirSync(backupDir, { recursive: true });
    
    // Copy all data files to backup directory
    if (fs.existsSync(DATA_DIR)) {
      const dataFiles = fs.readdirSync(DATA_DIR);
      
      for (const file of dataFiles) {
        const sourcePath = path.join(DATA_DIR, file);
        const destPath = path.join(backupDir, file);
        
        // Check if it's a file
        if (fs.statSync(sourcePath).isFile()) {
          fs.copyFileSync(sourcePath, destPath);
          log.debug(`Backed up: ${file}`);
        }
      }
    }
    
    log.info(`Created backup at: ${backupDir}`);
    return backupDir;
  } catch (error) {
    log.error(`Error creating backup: ${error.message}`);
    throw error;
  }
};

/**
 * Regenerate test data and create a new backup
 * @param {Object} options - Regeneration options
 * @returns {Promise<Object>} Regeneration results
 */
const regenerateData = async (options = {}) => {
  const {
    initialSupply = 1000000000,
    initialBurn = 95000000,
    createBackup = true,
    preserveStructure = true,
    mockCompletedMilestones = 10
  } = options;
  
  try {
    log.info('Starting data regeneration process');
    
    // Create a backup of current data first if requested
    let backupPath = null;
    if (createBackup) {
      backupPath = await createDataBackup();
      log.info(`Created backup at: ${backupPath}`);
    }
    
    // Clean existing data if requested
    if (options.cleanFirst) {
      await cleanData({
        cleanData: true,
        cleanBackups: true,
        preserveStructure
      });
    }
    
    // Ensure data directory exists
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    
    // Initialize file storage (creates empty files if they don't exist)
    // This simplified version doesn't rely on fileStorage
    const fileList = ['burns.json', 'metrics.json', 'milestones.json', 'rewards.json', 'tokenDetails.json', 'tokenBuys.json', 'tokenSetup.json'];
    
    fileList.forEach(file => {
      const filePath = path.join(DATA_DIR, file);
      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, '[]');
      }
    });
    
    const results = {
      createdFiles: [],
      milestones: {
        completed: 0,
        total: 0
      },
      burns: {
        automated: 0,
        milestone: 0,
        total: 0
      },
      metrics: {
        totalSupply: initialSupply,
        circulatingSupply: initialSupply - initialBurn,
        totalBurned: initialBurn
      },
      backupPath
    };
    
    // 1. Generate milestone data
    log.info('Generating milestone data...');
    const milestones = generateMilestoneData(mockCompletedMilestones);
    fs.writeFileSync(path.join(DATA_DIR, 'milestones.json'), JSON.stringify(milestones, null, 2));
    results.createdFiles.push('milestones.json');
    results.milestones.completed = milestones.filter(m => m.completed).length;
    results.milestones.total = milestones.length;
    
    // 2. Generate burn data
    log.info('Generating burn data...');
    const burns = generateBurnData(milestones);
    fs.writeFileSync(path.join(DATA_DIR, 'burns.json'), JSON.stringify(burns, null, 2));
    results.createdFiles.push('burns.json');
    
    const milestoneBurns = burns.filter(b => b.burnType === 'milestone');
    const automatedBurns = burns.filter(b => b.burnType === 'automated');
    results.burns.milestone = milestoneBurns.length;
    results.burns.automated = automatedBurns.length;
    results.burns.total = burns.length;
    
    // 3. Generate metrics data
    log.info('Generating metrics data...');
    const metrics = generateMetricsData(milestones, burns);
    fs.writeFileSync(path.join(DATA_DIR, 'metrics.json'), JSON.stringify(metrics, null, 2));
    results.createdFiles.push('metrics.json');
    
    // Use the latest metrics for results
    if (metrics.length > 0) {
      const latestMetrics = metrics[metrics.length - 1];
      results.metrics = {
        totalSupply: latestMetrics.totalSupply,
        circulatingSupply: latestMetrics.circulatingSupply,
        reserveWalletBalance: latestMetrics.reserveWalletBalance,
        totalBurned: latestMetrics.totalBurned,
        buybackBurned: latestMetrics.buybackBurned,
        milestoneBurned: latestMetrics.milestoneBurned
      };
    }
    
    // 4. Generate rewards data
    log.info('Generating rewards data...');
    const rewards = generateRewardsData();
    fs.writeFileSync(path.join(DATA_DIR, 'rewards.json'), JSON.stringify(rewards, null, 2));
    results.createdFiles.push('rewards.json');
    
    log.info('Data regeneration completed successfully');
    return {
      success: true,
      ...results
    };
  } catch (error) {
    log.error(`Error in data regeneration: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Generate milestone data with a given number of completed milestones
 * @param {Number} completedCount - Number of completed milestones
 * @returns {Array} Milestone data
 */
const generateMilestoneData = (completedCount = 10) => {
  // Define milestone schedule
  const milestoneSchedule = [
    { marketCap: 100000, burnAmount: 50000000, percentOfSupply: 5.00 },
    { marketCap: 200000, burnAmount: 25000000, percentOfSupply: 2.50 },
    { marketCap: 300000, burnAmount: 20000000, percentOfSupply: 2.00 },
    { marketCap: 500000, burnAmount: 20000000, percentOfSupply: 2.00 },
    { marketCap: 750000, burnAmount: 15000000, percentOfSupply: 1.50 },
    { marketCap: 1000000, burnAmount: 15000000, percentOfSupply: 1.50 },
    { marketCap: 1500000, burnAmount: 12500000, percentOfSupply: 1.25 },
    { marketCap: 2500000, burnAmount: 12500000, percentOfSupply: 1.25 },
    { marketCap: 3500000, burnAmount: 10000000, percentOfSupply: 1.00 },
    { marketCap: 5000000, burnAmount: 10000000, percentOfSupply: 1.00 },
    { marketCap: 7500000, burnAmount: 10000000, percentOfSupply: 1.00 },
    { marketCap: 10000000, burnAmount: 10000000, percentOfSupply: 1.00 },
    { marketCap: 15000000, burnAmount: 7500000, percentOfSupply: 0.75 },
    { marketCap: 25000000, burnAmount: 7500000, percentOfSupply: 0.75 },
    { marketCap: 35000000, burnAmount: 5000000, percentOfSupply: 0.50 },
    { marketCap: 50000000, burnAmount: 5000000, percentOfSupply: 0.50 },
    { marketCap: 75000000, burnAmount: 7500000, percentOfSupply: 0.75 },
    { marketCap: 90000000, burnAmount: 7500000, percentOfSupply: 0.75 },
    { marketCap: 100000000, burnAmount: 50000000, percentOfSupply: 5.00 }
  ];
  
  // Cap completed count to the schedule length
  completedCount = Math.min(completedCount, milestoneSchedule.length);
  
  // Generate milestone data
  return milestoneSchedule.map((milestone, index) => {
    const id = `milestone-${milestone.marketCap}`;
    const isCompleted = index < completedCount;
    
    // Base milestone data
    const milestoneData = {
      id,
      marketCap: milestone.marketCap,
      burnAmount: milestone.burnAmount,
      percentOfSupply: milestone.percentOfSupply,
      completed: isCompleted
    };
    
    // Add completion data if completed
    if (isCompleted) {
      // Generate a timestamp within the last 10 days, earlier milestones are completed earlier
      const daysAgo = completedCount - index;
      const hoursAgo = Math.floor(Math.random() * 24);
      const minutesAgo = Math.floor(Math.random() * 60);
      
      const completedAt = new Date();
      completedAt.setDate(completedAt.getDate() - daysAgo);
      completedAt.setHours(completedAt.getHours() - hoursAgo);
      completedAt.setMinutes(completedAt.getMinutes() - minutesAgo);
      
      const transactionHash = `Mi1est0neBurnTxHash${milestone.marketCap}`;
      
      return {
        ...milestoneData,
        completedAt: completedAt.toISOString(),
        transactionHash
      };
    }
    
    return milestoneData;
  });
};

/**
 * Generate burn data based on milestones
 * @param {Array} milestones - Milestone data
 * @returns {Array} Burn data
 */
const generateBurnData = (milestones) => {
  const burns = [];
  
  // 1. Add milestone burns
  const completedMilestones = milestones.filter(m => m.completed);
  
  completedMilestones.forEach(milestone => {
    burns.push({
      id: `milestone-${milestone.marketCap}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: milestone.completedAt,
      burnAmount: milestone.burnAmount,
      burnAmountUsd: milestone.burnAmount * 0.003, // Approximate USD value
      burnType: 'milestone',
      milestoneId: milestone.id,
      transactionHash: milestone.transactionHash
    });
  });
  
  // 2. Add automated burns (1 per hour for the last 5 days)
  const now = new Date();
  for (let i = 0; i < 120; i++) { // 5 days * 24 hours = 120 burns
    const hoursAgo = i;
    const timestamp = new Date(now);
    timestamp.setHours(timestamp.getHours() - hoursAgo);
    
    // Random burn amount between 50,000 and 200,000 tokens
    const burnAmount = Math.floor(Math.random() * 150000) + 50000;
    
    // Random SOL spent between 0.1 and 2.0 SOL
    const solSpent = (Math.random() * 1.9 + 0.1).toFixed(2);
    
    // USD value based on approximate SOL price ($400)
    const solSpentUsd = solSpent * 400;
    
    // Generate random transaction hash
    const txHash = Array(32)
      .fill(0)
      .map(() => Math.floor(Math.random() * 16).toString(16))
      .join('');
    
    burns.push({
      id: `automated-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: timestamp.toISOString(),
      burnAmount,
      burnAmountUsd: solSpentUsd,
      burnType: 'automated',
      solSpent: parseFloat(solSpent),
      solSpentUsd: solSpentUsd,
      transactionHash: txHash
    });
  }
  
  // Sort by timestamp (newest first)
  burns.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  
  return burns;
};

/**
 * Generate metrics data based on milestones and burns
 * @param {Array} milestones - Milestone data
 * @param {Array} burns - Burn data
 * @returns {Array} Metrics data
 */
const generateMetricsData = (milestones, burns) => {
  const metrics = [];
  const initialSupply = 1000000000; // 1 billion tokens
  const daysOfData = 10;
  
  // Sort burns by timestamp (oldest first)
  burns.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  
  // Generate a metric entry for each day with cumulative burn data
  const now = new Date();
  let totalBurned = 0;
  let milestoneBurned = 0;
  let buybackBurned = 0;
  
  for (let day = daysOfData; day >= 0; day--) {
    const date = new Date(now);
    date.setDate(date.getDate() - day);
    
    // Count burns that happened before this date
    const burnsSoFar = burns.filter(burn => new Date(burn.timestamp) <= date);
    
    totalBurned = burnsSoFar.reduce((sum, burn) => sum + burn.burnAmount, 0);
    milestoneBurned = burnsSoFar
      .filter(burn => burn.burnType === 'milestone')
      .reduce((sum, burn) => sum + burn.burnAmount, 0);
    buybackBurned = burnsSoFar
      .filter(burn => burn.burnType === 'automated')
      .reduce((sum, burn) => sum + burn.burnAmount, 0);
    
    // Calculate reserve wallet balance (30% of initial supply minus milestone burns)
    const reserveWalletBalance = Math.max(0, initialSupply * 0.3 - milestoneBurned);
    
    // Calculate circulating supply (total supply minus reserve wallet balance)
    const circulatingSupply = initialSupply - totalBurned - reserveWalletBalance;
    
    // Random SOL price
    const solPriceInUsd = (Math.random() * 100 + 350).toFixed(2);
    
    // Calculate market cap based on current burns
    const burntPercent = totalBurned / initialSupply;
    const progressFactor = 1 + burntPercent * 5; // More burns = higher market cap
    const baseMarketCap = 100000; // Base market cap of $100K
    const marketCap = Math.floor(baseMarketCap * progressFactor * (day + 1) / daysOfData);
    
    // Token price
    const priceInUsd = (marketCap / circulatingSupply).toFixed(6);
    const priceInSol = (priceInUsd / solPriceInUsd).toFixed(8);
    
    metrics.push({
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: date.toISOString(),
      totalSupply: initialSupply - totalBurned,
      circulatingSupply,
      reserveWalletBalance,
      totalBurned,
      buybackBurned,
      milestoneBurned,
      marketCap,
      priceInSol: parseFloat(priceInSol),
      priceInUsd: parseFloat(priceInUsd)
    });
  }
  
  return metrics;
};

/**
 * Generate rewards data
 * @returns {Array} Rewards data
 */
const generateRewardsData = () => {
  const rewards = [];
  const daysOfData = 10;
  
  // Generate rewards for each day (one per day)
  const now = new Date();
  for (let day = 0; day < daysOfData; day++) {
    const date = new Date(now);
    date.setDate(date.getDate() - day);
    date.setHours(1, 0, 29); // Set time to 01:00:29
    
    // Random reward amount between 0.5 and 1.5 SOL
    const rewardAmount = (Math.random() + 0.5).toFixed(2);
    
    // USD value (approximate SOL price = $400)
    const rewardAmountUsd = (rewardAmount * 400).toFixed(2);
    
    // Random transaction hash
    const burnTxHash = Array(32)
      .fill(0)
      .map(() => Math.floor(Math.random() * 16).toString(16))
      .join('');
    
    // Add 5 minutes for processing
    const processedAt = new Date(date);
    processedAt.setMinutes(processedAt.getMinutes() + 5);
    
    rewards.push({
      id: `${Date.now()}-reward${day + 1}`,
      timestamp: date.toISOString(),
      rewardAmount: parseFloat(rewardAmount),
      rewardAmountUsd: parseFloat(rewardAmountUsd),
      isProcessed: true,
      processedAt: processedAt.toISOString(),
      burnTxHash
    });
  }
  
  // Sort by timestamp (newest first)
  rewards.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  
  return rewards;
};

module.exports = {
  cleanData,
  regenerateData,
  createDataBackup
};