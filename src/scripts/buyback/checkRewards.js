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
 * With enhanced detection for small reward amounts
 * @returns {Promise<Object>} Reward status with available amount
 */
const checkAvailableRewards = async () => {
  try {
    logger.info('Checking for available rewards using transaction simulation');
    logger.info(`Using creatorVault: ${process.env.CREATOR_VAULT || 'Not Set'}`);
    logger.info(`Using creatorAddress: ${process.env.CREATOR_ADDRESS || 'Not Set'}`);
    
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
    logger.info('Simulating claim transaction to check for available rewards');
    const simulationResult = await connection.simulateTransaction(transaction);
    
    // Log simulation result status
    if (simulationResult.value.err) {
      logger.warn(`Simulation failed: ${JSON.stringify(simulationResult.value.err)}`);
      return {
        success: false,
        availableAmount: 0,
        error: `Simulation failed: ${JSON.stringify(simulationResult.value.err)}`
      };
    } else {
      logger.info('Simulation succeeded');
    }
    
    // Log simulation details
    const logs = simulationResult.value.logs || [];
    logger.debug(`Simulation returned ${logs.length} log entries`);
    
    if (logs.length > 0) {
      logger.debug(`First few simulation logs: ${JSON.stringify(logs.slice(0, 3))}`);
    }
    
    // Check for transfer logs that indicate SOL being received
    let availableAmount = 0;
    let transferFound = false;
    let transferLogFound = false;
    
    for (const log of logs) {
      logger.debug(`Processing log: ${log}`);
      
      // Look for System Program transfer messages
      if (log.includes('Program 11111111111111111111111111111111 invoke')) {
        logger.debug('Found System Program invocation, checking next logs...');
        const nextLog = logs[logs.indexOf(log) + 1];
        if (nextLog && nextLog.includes('Transfer')) {
          transferLogFound = true;
          logger.debug(`Found transfer log: ${nextLog}`);
          
          // Keep looking for amount information in subsequent logs
          const transferLamports = extractTransferAmount(logs, logs.indexOf(log));
          if (transferLamports > 0) {
            transferFound = true;
            availableAmount = transferLamports / 1e9; // Convert lamports to SOL
            logger.debug(`Extracted transfer amount: ${transferLamports} lamports (${availableAmount} SOL)`);
          }
        }
      }
      
      // Look for logs containing any data that might indicate SOL transfer
      if (log.includes('lamports') || log.includes('amount:') || log.includes('transfer')) {
        logger.debug(`Found potential transfer info: ${log}`);
        
        // Try to extract a number from this log
        const amountMatch = log.match(/(\d+(\.\d+)?)\s*(lamports|SOL)/i);
        if (amountMatch && amountMatch[1]) {
          const amount = parseFloat(amountMatch[1]);
          if (amount > 0) {
            transferFound = true;
            // If "SOL" is mentioned, it's already in SOL units
            const isInSol = amountMatch[3] && amountMatch[3].toLowerCase() === 'sol';
            availableAmount = isInSol ? amount : amount / 1e9;
            logger.debug(`Extracted amount from text: ${amount} ${isInSol ? 'SOL' : 'lamports'} (${availableAmount} SOL)`);
          }
        }
      }
      
      // Also check for direct logs about creator fee
      if (log.includes('creator fee:') || log.includes('creatorFee:')) {
        transferFound = true;
        logger.debug(`Found creator fee log: ${log}`);
        
        // Try to extract amount
        const match = log.match(/(?:creator fee|creatorFee):\s*["']?(\d+)["']?/i);
        if (match && match[1]) {
          const lamports = parseInt(match[1], 10);
          availableAmount = lamports / 1e9; // Convert to SOL
          logger.debug(`Extracted creator fee: ${lamports} lamports (${availableAmount} SOL)`);
        }
      }
    }
    
    // Check if the "No creator fee to collect" message exists
    const noRewardsMessage = logs.some(log => 
      log.includes('No creator fee to collect') || 
      log.includes('No coin creator fee to collect')
    );
    
    // Log the findings for debugging
    logger.info(`Transfer log found: ${transferLogFound}, Actual transfer found: ${transferFound}, Available amount: ${availableAmount}`);
    logger.info(`No rewards message: ${noRewardsMessage}`);
    
    if (noRewardsMessage) {
      logger.info('No rewards available to collect');
      return {
        success: true,
        availableAmount: 0,
        hasRewards: false
      };
    }
    
    // If we found a transfer indication but couldn't determine the amount precisely
    if (transferLogFound && !transferFound) {
      // Use a small non-zero minimum to trigger the claim process
      availableAmount = 0.0001; // Minimum amount
      logger.info(`Transfer log detected but couldn't determine exact amount. Using minimum: ${availableAmount} SOL`);
      transferFound = true;
    }
    
    // Enhanced detection for small rewards
    // Additional checks based on non-standard patterns in the simulation logs
    const potentialRewardIndicators = [
      // Check for any logs that might indicate SOL movement
      logs.some(log => log.includes('System Program') && log.includes('success')),
      logs.some(log => log.includes('success') && log.includes('collect')),
      logs.some(log => log.includes('Creator') && !log.includes('No creator'))
    ];
    
    // If there are potential indicators of rewards but we didn't extract an amount
    if (!transferFound && potentialRewardIndicators.some(indicator => indicator)) {
      logger.info('Detected potential rewards based on log patterns');
      
      // Get creator vault balance before and after to see if there's a difference
      try {
        const vaultBalanceBefore = await connection.getBalance(creatorVault);
        logger.debug(`Creator vault balance before: ${vaultBalanceBefore / 1e9} SOL`);
        
        // We can't actually execute the transaction here in a check function,
        // but this shows there might be rewards even if we can't determine the amount
        
        // Use a minimum amount to trigger the claim process
        availableAmount = 0.0001; // Minimum amount
        transferFound = true;
        logger.info(`Using minimum amount for potential rewards: ${availableAmount} SOL`);
      } catch (balanceError) {
        logger.warn(`Could not check vault balance: ${balanceError.message}`);
      }
    }
    
    if (availableAmount > 0) {
      logger.info(`Found available rewards: ${availableAmount} SOL`);
      return {
        success: true,
        availableAmount,
        hasRewards: true
      };
    }
    
    // If we've made it here, logs didn't conclusively show rewards
    logger.info('No clear evidence of rewards in simulation');
    return {
      success: true,
      availableAmount: 0,
      hasRewards: false,
      message: 'No clear evidence of rewards in simulation'
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

/**
 * Helper function to extract transfer amount from logs with enhanced detection
 * @param {Array} logs - Transaction logs
 * @param {Number} transferIndex - Index of the transfer log
 * @returns {Number} Transfer amount in lamports
 */
const extractTransferAmount = (logs, transferIndex) => {
  try {
    // Check the logs for amount information
    for (let i = transferIndex; i < transferIndex + 5 && i < logs.length; i++) {
      const log = logs[i];
      
      // Look for amount references with expanded patterns
      if (log.includes('amount:') || log.includes('lamports:') || 
          log.includes('creatorFee:') || log.includes('transfer') || 
          log.includes('SOL')) {
        
        logger.debug(`Found potential amount reference in log: ${log}`);
        
        // Try standard patterns first
        const standardMatch = log.match(/(?:amount|lamports|creatorFee):\s*(\d+)/i);
        if (standardMatch && standardMatch[1]) {
          return parseInt(standardMatch[1], 10);
        }
        
        // Try more general number extraction
        const numberMatch = log.match(/\b(\d+)\b/);
        if (numberMatch && numberMatch[1]) {
          const potentialAmount = parseInt(numberMatch[1], 10);
          // Only consider this a valid amount if it's reasonable (more than 1000 lamports)
          if (potentialAmount > 1000) {
            return potentialAmount;
          }
        }
      }
    }
    
    logger.debug('No amount reference found in logs');
    return 0;
  } catch (error) {
    logger.error(`Error extracting transfer amount: ${error.message}`);
    return 0;
  }
};

module.exports = {
  checkAvailableRewards,
  getCoinAccounts
};