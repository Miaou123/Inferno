/**
 * Simple script to test burnTokens.js with a custom amount
 * Usage: node testBurn.js [amount]
 */
require('dotenv').config();
const { createKeypair } = require('./src/scripts/utils/solana');
const { burnBuybackTokens } = require('./src/scripts/buyback/burnBuyBackTokens'); // Your fixed burnTokens function

// Get amount from command line or use default
const amount = process.argv[2] ? parseFloat(process.argv[2]) : 100;

async function testBurn() {
  console.log(`Testing burn with amount: ${amount} tokens`);
  
  const keypair = createKeypair();
  console.log(`Using wallet: ${keypair.publicKey.toString()}`);
  
  try {
    const result = await burnBuybackTokens(
      keypair,
      amount,
      process.env.TOKEN_ADDRESS,
      'test'
    );
    
    if (result.success) {
      console.log(`✅ Burn successful!`);
      console.log(`Amount: ${result.amount} tokens`);
      console.log(`Transaction: ${result.signature}`);
    } else {
      console.log(`❌ Burn failed: ${result.error}`);
      console.log(result.details);
    }
  } catch (error) {
    console.error(`Error during burn test: ${error.message}`);
  }
}

testBurn();