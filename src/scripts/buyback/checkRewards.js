/**
 * Improved Check Rewards utility for $INFERNO token
 * Part of the buyback system with enhanced small reward detection
 */
const { 
  Connection, 
  PublicKey, 
  Transaction, 
  TransactionInstruction,
  ComputeBudgetProgram,
  SystemProgram
} = require('@solana/web3.js');
const logger = require('../utils/logger').buyback;
const { createKeypair, getConnection } = require('../utils/solana');
require('dotenv').config();

// Constants based on successful transaction
const REWARDS_PROGRAM_ID = new PublicKey('pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA');
const WSOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');
const PROGRAM_AUTHORITY = new PublicKey('GS4CU59F31iL7aR2Q8zVS8DRrcRnXX1yjQ66TqNVQnaR');
const COMPUTE_BUDGET_PROGRAM = new PublicKey('ComputeBudget111111111111111111111111111111');
const COIN_PROGRAM = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const EVENT_AUTHORITY = new PublicKey('Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1');

/**
 * Get the accounts needed for the transaction
 * @returns {Object} Account information
 */
const getCoinAccounts = () => {
  try {
    // Creator vault - vault for creator rewards
    const creatorVault = process.env.CREATOR_VAULT || 'ANYekpdHFWSmVzEt9iBeLFMFeQiPGjcZexFkLprtcCHj';
    
    // Creator address - vault authority
    const creatorAddress = process.env.CREATOR_ADDRESS || '7S8Uf4JHVVxdLJMh68WCUpxWqoy3wMfPGMEqGKY31Rg5';
    
    logger.debug(`Using CREATOR_VAULT: ${creatorVault}`);
    logger.debug(`Using CREATOR_ADDRESS: ${creatorAddress}`);
    
    return {
      creatorVault: new PublicKey(creatorVault),
      creatorAddress: new PublicKey(creatorAddress)
    };
  } catch (error) {
    logger.error(`Error getting coin accounts: ${error.message}`);
    throw error;
  }
};

/**
 * Check for available creator rewards using transaction simulation
 * With optimized extraction of reward amounts from program data
 * @returns {Promise<Object>} Reward status with available amount
 */
const checkAvailableRewards = async () => {
  try {
    logger.info('Checking for available rewards using transaction simulation');
    
    // Get keypair and connection
    const keypair = createKeypair();
    const connection = getConnection();
    
    // Get the latest blockhash
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    
    // Get account information
    const { creatorVault, creatorAddress } = getCoinAccounts();
    
    // Create transaction for simulation
    const transaction = new Transaction();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = keypair.publicKey;
    
    // 1. Set compute unit limit
    transaction.add(
      new TransactionInstruction({
        programId: COMPUTE_BUDGET_PROGRAM,
        keys: [],
        data: Buffer.from([2, 248, 61, 1, 0])
      })
    );
    
    // 2. Set compute unit price
    transaction.add(
      new TransactionInstruction({
        programId: COMPUTE_BUDGET_PROGRAM,
        keys: [],
        data: Buffer.from([3, 160, 134, 1, 0, 0, 0, 0, 0])
      })
    );
    
    // 3. Collect creator fee - THIS IS THE MAIN INSTRUCTION THAT COLLECTS REWARDS
    transaction.add(
      new TransactionInstruction({
        programId: COIN_PROGRAM,
        keys: [
          { pubkey: keypair.publicKey, isSigner: true, isWritable: true },
          { pubkey: creatorVault, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          { pubkey: EVENT_AUTHORITY, isSigner: false, isWritable: false },
          { pubkey: COIN_PROGRAM, isSigner: false, isWritable: false }
        ],
        data: Buffer.from([20, 22, 86, 123, 198, 28, 219, 132])
      })
    );
    
    // Simulate the transaction
    const simulationResult = await connection.simulateTransaction(transaction);
    
    // Check for simulation errors
    if (simulationResult.value.err) {
      logger.error(`Simulation failed: ${JSON.stringify(simulationResult.value.err)}`);
      return {
        success: false,
        availableAmount: 0,
        error: `Simulation failed: ${JSON.stringify(simulationResult.value.err)}`
      };
    }
    
    // Get all logs from simulation
    const logs = simulationResult.value.logs || [];
    
    // Check if the "No creator fee to collect" message exists
    const noRewardsMessage = logs.some(log => 
      log.includes('No creator fee to collect') || 
      log.includes('No coin creator fee to collect')
    );
    
    if (noRewardsMessage) {
      logger.info('No rewards available to collect');
      return {
        success: true,
        availableAmount: 0,
        hasRewards: false
      };
    }
    
    // Extract rewards amount from offset 48 which is the reliable location
    let availableAmount = 0;
    
    // Look for program data 
    for (const log of logs) {
      if (log.includes('Program data:')) {
        const dataPartMatch = log.match(/Program data:\s*(.*)/);
        if (dataPartMatch && dataPartMatch[1]) {
          const dataPart = dataPartMatch[1].trim();
          const buffer = Buffer.from(dataPart, 'base64');
          
          // Check offset 48 for the reward amount
          try {
            if (buffer.length >= 52) {  // Make sure buffer is long enough
              const offset48Value = buffer.readUInt32LE(48);
              if (offset48Value >= 10000 && offset48Value <= 10000000) {
                availableAmount = offset48Value / 1e9;
                // Found the reward at offset 48, no need to check further
                break;
              }
            }
          } catch (e) {
            // If error reading offset 48, just continue
          }
        }
      }
    }
    
    // Only log success if we found rewards, but don't mention threshold here
    if (availableAmount > 0) {
      logger.info(`Simulation successful: ${availableAmount} SOL available`);
      return {
        success: true,
        availableAmount,
        hasRewards: true,
        isExactAmount: true
      };
    }
    
    // No rewards found
    logger.info('No rewards detected');
    return {
      success: true,
      availableAmount: 0,
      hasRewards: false
    };
  } catch (error) {
    logger.error(`Error checking available rewards: ${error.message}`);
    return { 
      success: false, 
      availableAmount: 0,
      error: error.message 
    };
  }
};

module.exports = {
  checkAvailableRewards,
  getCoinAccounts
};