/**
 * Direct test buyback script with improved error handling
 * Tests executeBuyback with real Solana transactions
 */
const { executeBuyback } = require('./buyback/executeBuyback');
const fileStorage = require('./utils/fileStorage');
const logger = require('./utils/logger').buyback;
const { createKeypair, getConnection, getSolBalance } = require('./utils/solana');
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
 * @param {Object} options - Test options
 * @param {Number} options.solAmount - Amount of SOL to use for the buyback
 * @param {Boolean} options.skipBalanceCheck - Skip SOL balance check
 * @param {Boolean} options.useExistingReward - Use existing reward from storage instead of creating new
 * @param {String} options.targetToken - Override target token address
 * @param {String} options.creatorVault - Override creator vault address
 * @param {Boolean} options.forceTestMode - Force test mode (simulation only)
 */
const testBuyback = async (options = {}) => {
  try {
    // Parse options with defaults
    const {
      solAmount = 0.01,
      skipBalanceCheck = false,
      useExistingReward = false,
      targetToken = null,
      creatorVault = null,
      forceTestMode = false
    } = options;
    
    logger.info(`Starting test buyback with ${solAmount} SOL`);
    logger.info(`Test configuration: ${JSON.stringify({
      skipBalanceCheck,
      useExistingReward,
      targetToken: targetToken || "default from .env",
      creatorVault: creatorVault || "default from .env",
      forceTestMode
    })}`);
    
    // Initialize storage
    fileStorage.initializeStorage();
    
    // Save original environment values
    const originalTokenAddress = process.env.TOKEN_ADDRESS;
    const originalCreatorVault = process.env.CREATOR_VAULT;
    const originalTestMode = process.env.TEST_MODE;
    
    // Set temporary environment variables if specified
    if (targetToken) {
      process.env.TOKEN_ADDRESS = targetToken;
      logger.info(`Temporarily set TOKEN_ADDRESS to ${targetToken}`);
    }
    
    if (creatorVault) {
      process.env.CREATOR_VAULT = creatorVault;
      logger.info(`Temporarily set CREATOR_VAULT to ${creatorVault}`);
    }
    
    if (forceTestMode) {
      process.env.TEST_MODE = 'true';
      logger.info(`Temporarily enabled TEST_MODE`);
    }
    
    // Check wallet SOL balance
    if (!skipBalanceCheck && !forceTestMode) {
      const keypair = createKeypair();
      const connection = getConnection();
      const walletBalance = await getSolBalance(keypair.publicKey.toString());
      
      if (walletBalance < solAmount * 1.2) { // 20% buffer for fees
        logger.error(`Insufficient SOL balance: ${walletBalance} SOL. Need at least ${solAmount * 1.2} SOL for this test.`);
        return {
          success: false,
          error: `Insufficient SOL balance: ${walletBalance} SOL`
        };
      }
      
      logger.info(`Wallet balance check passed: ${walletBalance} SOL available`);
    } else {
      logger.info('Skipping wallet balance check');
    }
    
    // Get or create reward record
    let rewardRecord;
    
    if (useExistingReward) {
      // Find the most recent unprocessed reward
      const rewards = fileStorage.findRecords('rewards', 
        reward => !reward.tokensBought && !reward.tokensBurned, 
        { sort: { field: 'timestamp', order: 'desc' }, limit: 1 }
      );
      
      if (rewards.length > 0) {
        rewardRecord = rewards[0];
        logger.info(`Using existing reward record with ID: ${rewardRecord.id} and amount: ${rewardRecord.rewardAmount} SOL`);
      } else {
        logger.warn('No existing unprocessed reward found. Creating a mock reward.');
        rewardRecord = createMockReward(solAmount);
      }
    } else {
      // Create a new mock reward
      rewardRecord = createMockReward(solAmount);
    }
    
    // Get network information
    const connection = getConnection();
    const endpoint = connection._rpcEndpoint;
    const network = endpoint.includes('devnet') ? 'devnet' : 
                    endpoint.includes('testnet') ? 'testnet' : 'mainnet';
    
    logger.info(`Executing buyback on ${network} network (${endpoint})`);
    
    // Execute the buyback
    logger.info('Executing buyback...');
    const startTime = Date.now();
    const buybackResult = await executeBuyback(solAmount, rewardRecord.id);
    const duration = (Date.now() - startTime) / 1000; // duration in seconds
    
    // Log results
    if (buybackResult.success) {
      logger.info(`Buyback successful! Bought ${buybackResult.tokenAmount} tokens with ${buybackResult.solAmount} SOL`);
      logger.info(`Transaction signature: ${buybackResult.txSignature}`);
      logger.info(`Transaction duration: ${duration.toFixed(2)} seconds`);
      
      // Add explorer link
      let explorerUrl;
      if (network === 'devnet') {
        explorerUrl = `https://explorer.solana.com/tx/${buybackResult.txSignature}?cluster=devnet`;
      } else {
        explorerUrl = `https://solscan.io/tx/${buybackResult.txSignature}`;
      }
      logger.info(`Explorer link: ${explorerUrl}`);
      
      // Add completion info to result
      buybackResult.duration = duration;
      buybackResult.explorerUrl = explorerUrl;
      buybackResult.network = network;
    } else {
      logger.error(`Buyback failed: ${buybackResult.error}`);
    }
    
    // Restore original environment values
    if (targetToken) {
      process.env.TOKEN_ADDRESS = originalTokenAddress;
    }
    if (creatorVault) {
      process.env.CREATOR_VAULT = originalCreatorVault;
    }
    if (forceTestMode) {
      process.env.TEST_MODE = originalTestMode;
    }
    
    return buybackResult;
  } catch (error) {
    logger.error(`Error in test buyback: ${error.message}`);
    return {
      success: false,
      error: error.message,
      stack: error.stack
    };
  }
};

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  solAmount: 0.01,      // Default SOL amount
  skipBalanceCheck: false,
  useExistingReward: false,
  targetToken: null,
  creatorVault: null,
  forceTestMode: false
};

// Parse command line arguments
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    const option = args[i].substring(2);
    const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : 'true';
    
    switch (option) {
      case 'amount':
        options.solAmount = parseFloat(value);
        i++;  // Skip next argument
        break;
      case 'skip-balance-check':
        options.skipBalanceCheck = value === 'true';
        break;
      case 'use-existing-reward':
        options.useExistingReward = value === 'true';
        break;
      case 'token':
        options.targetToken = value;
        i++;  // Skip next argument
        break;
      case 'creator-vault':
        options.creatorVault = value;
        i++;  // Skip next argument
        break;
      case 'test-mode':
        options.forceTestMode = value === 'true';
        break;
      case 'help':
        console.log(`
Test Buyback Script - Tests real buyback transactions

Usage:
  node testBuyback.js [options]

Options:
  --amount <amount>           SOL amount to use (default: 0.01)
  --skip-balance-check        Skip SOL balance verification
  --use-existing-reward       Use existing reward from storage
  --token <address>           Override token address
  --creator-vault <address>   Override creator vault address
  --test-mode                 Force test mode (simulation only)
  --help                      Show this help message
        `);
        process.exit(0);
        break;
    }
  } else if (!isNaN(parseFloat(args[i])) && options.solAmount === 0.01) {
    // Simple argument is interpreted as SOL amount for backward compatibility
    options.solAmount = parseFloat(args[i]);
  }
}

// Run the test
console.log(`Starting buyback test with options: ${JSON.stringify(options)}`);
testBuyback(options)
  .then(result => {
    console.log('\nTest buyback complete. Result:');
    console.log(JSON.stringify(result, null, 2));
    
    if (result.success) {
      console.log(`\nTransaction successful! View details at: ${result.explorerUrl}`);
    }
    
    process.exit(result.success ? 0 : 1);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });