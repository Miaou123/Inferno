/**
 * Simple script to test executeBuyback.js with custom amount
 * Usage: node testBuyback.js [solAmount]
 */
require('dotenv').config();
const { executeBuyback } = require('./src/scripts/buyback/executeBuyback');

// Get SOL amount from command line or use default
const solAmount = process.argv[2] ? parseFloat(process.argv[2]) : 0.01;
const rewardId = `manual-test-${Date.now()}`;

async function testBuyback() {
  console.log(`Testing buyback with ${solAmount} SOL`);
  
  try {
    const result = await executeBuyback(solAmount, rewardId);
    
    console.log(`\nBuyback result:`);
    if (result.success) {
      console.log(`✅ Buyback successful!`);
      console.log(`Tokens bought: ${result.tokenAmount}`);
      console.log(`SOL spent: ${result.solAmount}`);
      console.log(`Transaction: ${result.txSignature}`);
    } else {
      console.log(`❌ Buyback failed: ${result.error}`);
    }
  } catch (error) {
    console.error(`Error during buyback: ${error.message}`);
  }
}

testBuyback();