/**
 * Test script for rewards claiming functionality
 * Creates mock reward data to test the rewards system
 */
require('dotenv').config();
const logger = require('./utils/logger');
const fileStorage = require('./utils/fileStorage');
const { processRewards } = require('./rewards/index');

const testRewardsClaim = async () => {
  try {
    console.log('=========== TESTING REWARDS SYSTEM ===========');
    
    // Ensure we're in mock mode
    process.env.MOCK_MODE = 'true';
    process.env.USE_MOCK_DATA = 'true';
    
    // Initialize storage
    fileStorage.initializeStorage();
    
    console.log('Creating mock reward data...');
    
    // Create a new mock reward
    const newReward = {
      rewardAmount: 0.42,
      rewardAmountUsd: 167.58, // assuming SOL price is $399
      isProcessed: false, // not processed yet
      timestamp: new Date().toISOString()
    };
    
    // Save to storage
    const savedReward = fileStorage.saveRecord('rewards', newReward);
    console.log('Created new mock reward:');
    console.log(JSON.stringify(savedReward, null, 2));
    
    // Simulate processing the reward
    console.log('Simulating reward processing...');
    
    // Update the reward to mark it as processed
    const processedReward = fileStorage.updateRecord('rewards', savedReward.id, {
      isProcessed: true,
      processedAt: new Date().toISOString(),
      burnTxHash: `mockTx${Math.random().toString(36).substring(2, 9)}`
    });
    
    console.log('Processed reward:');
    console.log(JSON.stringify(processedReward, null, 2));
    
    // Check all saved rewards data
    const rewards = fileStorage.findRecords('rewards', () => true, {
      sort: { field: 'timestamp', order: 'desc' },
      limit: 10
    });
    
    console.log('All rewards data:');
    console.log(JSON.stringify(rewards, null, 2));
    
    console.log('=========== REWARDS TEST COMPLETED ===========');
  } catch (error) {
    console.error('Error testing rewards process:', error);
  }
};

// Run the test if this file is executed directly
if (require.main === module) {
  testRewardsClaim().catch(console.error);
}

module.exports = testRewardsClaim;