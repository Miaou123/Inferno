/**
 * Test script for pAMMBay reward checking and claiming
 * Usage: node testPAMMBayRewards.js
 */
require('dotenv').config();
const { checkAvailableRewards } = require('./src/scripts/buyback/checkRewards');
const { claimRewards } = require('./src/scripts/buyback/claimRewards');

async function testPAMMBayRewards() {
  console.log(`🔥 Testing pAMMBay reward system...`);
  
  try {
    // Step 1: Check for available rewards
    console.log('\n📊 Step 1: Checking for available rewards...');
    const rewardsCheck = await checkAvailableRewards();
    
    console.log(`\nRewards check result:`);
    console.log(`✅ Success: ${rewardsCheck.success}`);
    console.log(`💰 Available amount: ${rewardsCheck.availableAmount} WSOL`);
    console.log(`🎯 Has rewards: ${rewardsCheck.hasRewards ? 'Yes' : 'No'}`);
    
    if (rewardsCheck.message) {
      console.log(`📝 Message: ${rewardsCheck.message}`);
    }
    
    if (rewardsCheck.vaultAddress) {
      console.log(`🏦 Vault address: ${rewardsCheck.vaultAddress}`);
    }
    
    if (!rewardsCheck.success) {
      console.log(`❌ Error: ${rewardsCheck.error}`);
      return;
    }
    
    // Step 2: If rewards are available, test claiming them
    if (rewardsCheck.hasRewards && rewardsCheck.availableAmount > 0) {
      console.log('\n💎 Step 2: Testing reward claim...');
      console.log('⚠️  This will actually claim the rewards if they exist!');
      console.log('💡 Set TEST_MODE=true in .env to simulate without claiming');
      
      const shouldClaim = process.env.TEST_MODE !== 'true';
      
      if (shouldClaim) {
        console.log('🚀 Proceeding with actual claim...');
        
        const claimResult = await claimRewards();
        
        console.log(`\nClaim result:`);
        if (claimResult.success) {
          console.log(`✅ Claim successful!`);
          console.log(`💰 Amount claimed: ${claimResult.amount} WSOL`);
          console.log(`💵 USD value: $${claimResult.amountUsd.toFixed(2)}`);
          console.log(`🔗 Transaction: ${claimResult.txSignature}`);
          console.log(`🌐 Explorer: ${claimResult.explorerUrl}`);
          console.log(`📁 Reward ID: ${claimResult.rewardId}`);
        } else {
          console.log(`❌ Claim failed: ${claimResult.error}`);
        }
      } else {
        console.log('🧪 TEST_MODE enabled - skipping actual claim');
        console.log('💡 Set TEST_MODE=false to claim rewards');
      }
    } else {
      console.log('\n💔 No rewards available to claim');
      console.log('💡 Trade some tokens to generate creator fees, then try again');
    }
    
  } catch (error) {
    console.error(`💥 Error during test: ${error.message}`);
    console.error(error.stack);
  }
}

// Add some utility info
console.log('🔧 pAMMBay Reward Testing Utility');
console.log('📋 This script tests the updated reward checking and claiming system');
console.log('🎯 Using pAMMBay program: pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA');
console.log('');

testPAMMBayRewards();