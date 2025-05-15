/**
 * Test Buyback Script for $INFERNO Token
 * Manually executes a buyback with a specified amount of SOL
 */
const { executeBuyback } = require('./buyback/executeBuyback');
const fileStorage = require('./utils/fileStorage');
const logger = require('./utils/logger').buyback;
require('dotenv').config();

/**
 * Create a mock reward record for testing
 * @param {Number} solAmount - Amount of SOL for the test
 * @returns {Object} Created reward record
 */
const createMockReward = (solAmount) => {
  // Create a mock reward record
  const mockReward = {
    rewardAmount: solAmount,
    rewardAmountUsd: solAmount * 400, // Approximate SOL price = $400
    isProcessed: false,
    claimTxSignature: 'MOCK_CLAIM_TX_SIGNATURE',
    timestamp: new Date().toISOString()
  };
  
  // Save mock reward to storage
  const savedReward = fileStorage.saveRecord('rewards', mockReward);
  logger.info(`Created mock reward record with ID: ${savedReward.id} and amount: ${solAmount} SOL`);
  
  return savedReward;
};

/**
 * Run a test buyback with a specified amount of SOL
 * @param {Number} solAmount - Amount of SOL to use for the buyback (default: 0.01)
 */
const testBuyback = async (solAmount = 0.01) => {
  try {
    logger.info(`Starting test buyback with ${solAmount} SOL`);
    
    // Initialize storage
    fileStorage.initializeStorage();
    
    // Create a mock reward record
    const mockReward = createMockReward(solAmount);
    
    // Execute the buyback
    logger.info('Executing buyback...');
    const buybackResult = await executeBuyback(solAmount, mockReward.id);
    
    // Log results
    if (buybackResult.success) {
      logger.info(`Buyback successful! Bought ${buybackResult.tokenAmount} tokens with ${buybackResult.solAmount} SOL`);
      logger.info(`Transaction signature: ${buybackResult.txSignature}`);
    } else {
      logger.error(`Buyback failed: ${buybackResult.error}`);
    }
    
    return buybackResult;
  } catch (error) {
    logger.error(`Error in test buyback: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
};

// Get SOL amount from command line argument or use default
const solAmount = process.argv[2] ? parseFloat(process.argv[2]) : 0.01;

// Run the test
testBuyback(solAmount)
  .then(result => {
    console.log('\nTest buyback complete. Result:');
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.success ? 0 : 1);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });