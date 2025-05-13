/**
 * Test script for $INFERNO token components
 * This script can be used to test various components without executing actual burns
 */
const { 
  BURN_SCHEDULE, 
  getNextMilestone,
  getPendingMilestones 
} = require('./milestone/burnConfig');
const priceOracle = require('./utils/priceOracle');
require('dotenv').config();

// Test milestone burn calculations
const testMilestones = () => {
  console.log('\n=== TESTING MILESTONE CALCULATIONS ===\n');
  
  // Print the burn schedule
  console.log('BURN SCHEDULE:');
  console.log('Market Cap\tBurn Amount\t% Supply\tCumulative %');
  console.log('----------------------------------------------------------');
  
  let cumulativePercent = 0;
  BURN_SCHEDULE.forEach(milestone => {
    cumulativePercent += milestone.percentOfSupply;
    console.log(
      `$${milestone.marketCap.toLocaleString()}\t${milestone.burnAmount.toLocaleString()}\t\t${milestone.percentOfSupply.toFixed(2)}%\t\t${cumulativePercent.toFixed(2)}%`
    );
  });
  
  // Test getting next milestone
  console.log('\nTESTING getNextMilestone:');
  const testMarketCaps = [50000, 100000, 150000, 250000, 1000000];
  const completedMilestones = [100000]; // Assume $100K milestone is already completed
  
  testMarketCaps.forEach(marketCap => {
    const nextMilestone = getNextMilestone(marketCap, completedMilestones);
    console.log(`Market Cap: $${marketCap.toLocaleString()}, Next Milestone:`, 
      nextMilestone ? `$${nextMilestone.marketCap.toLocaleString()}` : 'None');
  });
  
  // Test getting pending milestones
  console.log('\nTESTING getPendingMilestones:');
  const pendingMilestones = getPendingMilestones(500000, completedMilestones);
  console.log(`With Market Cap $500K and completed [${completedMilestones}], pending milestones:`);
  pendingMilestones.forEach(milestone => {
    console.log(`- $${milestone.marketCap.toLocaleString()} (${milestone.burnAmount.toLocaleString()} tokens)`);
  });
  
  // Verify total burn percentage
  const totalBurnPercent = BURN_SCHEDULE.reduce((sum, milestone) => sum + milestone.percentOfSupply, 0);
  console.log(`\nTotal burn percentage: ${totalBurnPercent.toFixed(2)}%`);
  
  // Verify total burn amount
  const totalBurnAmount = BURN_SCHEDULE.reduce((sum, milestone) => sum + milestone.burnAmount, 0);
  console.log(`Total burn amount: ${totalBurnAmount.toLocaleString()} tokens`);
  const initialSupply = Number(process.env.INITIAL_SUPPLY) || 1000000000;
  console.log(`That's ${((totalBurnAmount / initialSupply) * 100).toFixed(2)}% of initial supply`);
  
  if (Math.abs((totalBurnAmount / initialSupply) * 100 - 30) < 0.1) {
    console.log('✓ PASS: Total burn amount is 30% of initial supply');
  } else {
    console.log('✗ FAIL: Total burn amount is not 30% of initial supply');
  }
}

// Mock test for price oracle
const testPriceOracle = async () => {
  console.log('\n=== TESTING PRICE ORACLE ===\n');
  
  // Override the fetchTokenPrice method for testing
  const originalFetchTokenPrice = priceOracle.fetchTokenPrice;
  priceOracle.fetchTokenPrice = async () => {
    console.log('Mocking token price fetch');
    return {
      tokenPriceInSol: 0.00001, // Mock price in SOL
      tokenPriceInUsd: 0.001, // Mock price in USD
      solPriceInUsd: 100, // Mock SOL price
    };
  };
  
  try {
    // Get price data
    console.log('Fetching token price...');
    const priceData = await priceOracle.fetchTokenPrice();
    console.log('Token price:', priceData);
    
    // Calculate market cap (using mocked methods)
    console.log('Calculating market cap...');
    const marketCap = await priceOracle.getMarketCap();
    console.log(`Market Cap: $${marketCap.toLocaleString()}`);
    
    // Verify we're hitting the milestones
    console.log('\nChecking which milestones would be triggered at this market cap:');
    const pendingMilestones = getPendingMilestones(marketCap, []);
    if (pendingMilestones.length > 0) {
      console.log(`There are ${pendingMilestones.length} milestones that would be triggered:`);
      pendingMilestones.forEach(milestone => {
        console.log(`- $${milestone.marketCap.toLocaleString()} (${milestone.burnAmount.toLocaleString()} tokens)`);
      });
    } else {
      console.log('No milestones would be triggered at the current market cap.');
    }
  } catch (error) {
    console.error('Error in price oracle test:', error);
  } finally {
    // Restore the original method
    priceOracle.fetchTokenPrice = originalFetchTokenPrice;
  }
}

// Main test function
const runTests = async () => {
  console.log('=== $INFERNO TOKEN TEST SCRIPT ===');
  console.log('This script tests components without executing actual burns\n');
  
  // Test milestone calculations
  testMilestones();
  
  // Test price oracle
  await testPriceOracle();
  
  console.log('\n=== TESTS COMPLETED ===');
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = {
  testMilestones,
  testPriceOracle,
  runTests
};