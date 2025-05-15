// src/scripts/dataManager.js
const path = require('path');
const { cleanData, regenerateData } = require('./utils/dataManager');

const runDataOperation = async () => {
  const operation = process.argv[2] || 'help';
  
  switch (operation) {
    case 'clean':
      console.log('Cleaning data files (preserving backups)...');
      await cleanData({
        cleanData: true,
        cleanBackups: false,  // Don't touch backups with regular clean
        preserveStructure: true
      });
      break;
      
    case 'clean-all':
      console.log('Cleaning ALL data and backup files...');
      await cleanData({
        cleanData: true,
        cleanBackups: true,
        keepLatestBackup: false,  // Don't keep any backups
        preserveStructure: true
      });
      break;

    case 'clean-backups':
      console.log('Cleaning backup directories (preserving latest)...');
      await cleanData({
        cleanData: false,  // Don't touch data files
        cleanBackups: true,
        keepLatestBackup: true,  // Keep the most recent backup
        preserveStructure: true
      });
      break;
      
    case 'regenerate':
      console.log('Regenerating test data...');
      await regenerateData({
        createBackup: true,
        mockCompletedMilestones: 10
      });
      break;
      
    case 'reset':
      console.log('Resetting data (clean + regenerate)...');
      await cleanData({
        cleanData: true,
        cleanBackups: false,
        preserveStructure: true
      });
      await regenerateData({
        createBackup: false,
        mockCompletedMilestones: 5
      });
      break;
      
    case 'help':
    default:
      console.log(`
Data Management Utility

Usage:
  node src/scripts/dataManager.js [operation]

Operations:
  clean         - Clean data files only
  clean-all     - Clean ALL data and backup files
  clean-backups - Clean backup directories (keeps latest)
  regenerate    - Create test data
  reset         - Clean and regenerate data
  help          - Show this help message
      `);
      break;
  }
};

runDataOperation().catch(console.error);