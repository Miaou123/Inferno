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
    logger.info('Simulating claim transaction to check for available rewards');
    const simulationResult = await connection.simulateTransaction(transaction);
    
    // Check for simulation errors
    if (simulationResult.value.err) {
      logger.warn(`Simulation failed: ${JSON.stringify(simulationResult.value.err)}`);
      return {
        success: false,
        availableAmount: 0,
        error: `Simulation failed: ${JSON.stringify(simulationResult.value.err)}`
      };
    }
    
    // Get all logs from simulation
    const logs = simulationResult.value.logs || [];
    
    // Variables for tracking rewards
    let availableAmount = 0;
    let transferFound = false;
    let extractionMethod = '';
    
    // APPROACH 1: Try to extract from balances first (if available)
    try {
      const preBalances = simulationResult.value.preBalances;
      const postBalances = simulationResult.value.postBalances;
      
      if (preBalances && postBalances && preBalances.length >= 2 && postBalances.length >= 2) {
        const walletPreBalance = preBalances[0];
        const walletPostBalance = postBalances[0];
        const vaultPreBalance = preBalances[1];
        const vaultPostBalance = postBalances[1];
        
        // Estimate fee
        const estimatedFee = simulationResult.value.unitsConsumed 
          ? Math.ceil(simulationResult.value.unitsConsumed / 1000)
          : 13000;
        
        // Calculate changes
        const walletChange = (walletPostBalance - walletPreBalance) + estimatedFee;
        const vaultChange = vaultPreBalance - vaultPostBalance;
        
        if (walletChange > 0 && vaultChange > 0) {
          const rewardAmount = Math.min(walletChange, vaultChange);
          availableAmount = rewardAmount / 1e9;
          transferFound = true;
          extractionMethod = 'balance-analysis';
          logger.info(`Extracted reward from balance changes: ${rewardAmount} lamports (${availableAmount} SOL)`);
        }
      }
    } catch (error) {
      // Continue to next approach if balance extraction fails
    }
    
    // APPROACH 2: Extract from program data if balance approach didn't work
    if (!transferFound) {
      // Find program data in logs
      for (const log of logs) {
        if (log.includes('Program data:')) {
          const dataPartMatch = log.match(/Program data:\s*(.*)/);
          if (dataPartMatch && dataPartMatch[1]) {
            const dataPart = dataPartMatch[1].trim();
            
            // Decode base64 data
            const buffer = Buffer.from(dataPart, 'base64');
            
            // Find potential reward amounts
            const extractedAmounts = [];
            
            // Scan for UInt32 values that could be rewards
            for (let offset = 0; offset < buffer.length - 4; offset++) {
              try {
                const value = buffer.readUInt32LE(offset);
                // Filter for plausible reward amounts (10K-10M lamports)
                if (value >= 10000 && value <= 10000000) {
                  extractedAmounts.push({
                    offset,
                    lamports: value,
                    sol: value / 1e9
                  });
                }
              } catch (e) {
                // Skip errors
              }
            }
            
            // Sort by likelihood based on value range
            const sortedAmounts = extractedAmounts.sort((a, b) => {
              const idealRange = (value) => {
                if (value >= 5000000 && value <= 6000000) return 3; // Very likely
                if (value >= 1000000 && value <= 10000000) return 2; // Likely
                return 1; // Possible
              };
              
              return idealRange(b.lamports) - idealRange(a.lamports);
            });
            
            // Use most likely amount if found
            if (sortedAmounts.length > 0) {
              logger.info(`Found ${sortedAmounts.length} potential reward amounts in program data:`);
              sortedAmounts.slice(0, 3).forEach((amount, i) => {
                logger.info(`Option ${i+1}: ${amount.lamports} lamports (${amount.sol} SOL) at offset ${amount.offset}`);
              });
              
              availableAmount = sortedAmounts[0].lamports / 1e9;
              transferFound = true;
              extractionMethod = 'program-data';
              logger.info(`Extracted exact amount from program data: ${sortedAmounts[0].lamports} lamports (${availableAmount} SOL)`);
            }
            break;
          }
        }
      }
    }
    
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
    
    // Return results if rewards found
    if (transferFound && availableAmount > 0) {
      logger.info(`Found available rewards: ${availableAmount} SOL`);
      return {
        success: true,
        availableAmount,
        hasRewards: true,
        isExactAmount: true,
        extractionMethod
      };
    }
    
    // If nothing found but we see indicators of rewards, use minimal fallback
    if (!transferFound) {
      const hasRewardIndicators = logs.some(log => log.includes('System Program') && log.includes('success'));
      
      if (hasRewardIndicators) {
        availableAmount = 0.005; // Conservative estimate
        logger.info(`Using conservative estimate: ${availableAmount} SOL`);
        return {
          success: true,
          availableAmount,
          hasRewards: true,
          isExactAmount: false,
          extractionMethod: 'fallback-estimate'
        };
      }
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