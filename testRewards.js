/**
 * Simple script to test checkAvailableRewards.js
 * Usage: node testRewards.js
 */
require('dotenv').config();
const { checkAvailableRewards } = require('./src/scripts/buyback/checkRewards');

async function testRewards() {
  console.log(`Testing checkAvailableRewards function...`);
  
  try {
    const result = await checkAvailableRewards();
    
    console.log(`\nRewards check result:`);
    if (result.success) {
      console.log(`✅ Success!`);
      console.log(`Available amount: ${result.availableAmount} SOL`);
      console.log(`Has rewards: ${result.hasRewards ? 'Yes' : 'No'}`);
      
      if (result.message) {
        console.log(`Message: ${result.message}`);
      }
    } else {
      console.log(`❌ Check failed: ${result.error}`);
    }
  } catch (error) {
    console.error(`Error checking rewards: ${error.message}`);
  }
}

testRewards();