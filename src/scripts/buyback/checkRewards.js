/**
 * Check available rewards utility for $INFERNO token
 * Part of the buyback system
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
      
      if (simulationResult.value.err) {
        logger.warn(`Simulation failed: ${JSON.stringify(simulationResult.value.err)}`);
        return {
          success: false,
          availableAmount: 0,
          error: `Simulation failed: ${JSON.stringify(simulationResult.value.err)}`
        };
      }
      
      // Check logs for collection status
      const logs = simulationResult.value.logs || [];
      
      // Check for transfer logs that indicate SOL being received
      let availableAmount = 0;
      let transferFound = false;
      
      for (const log of logs) {
        logger.debug(`Simulation log: ${log}`);
        
        // Look for System Program transfer messages
        if (log.includes('Program 11111111111111111111111111111111 invoke')) {
          const nextLog = logs[logs.indexOf(log) + 1];
          if (nextLog && nextLog.includes('Transfer')) {
            transferFound = true;
            // Try to extract the amount
            const transferLamports = extractTransferAmount(logs, logs.indexOf(log));
            if (transferLamports > 0) {
              availableAmount = transferLamports / 1e9; // Convert lamports to SOL
            }
          }
        }
        
        // Also check for direct logs about creator fee
        if (log.includes('creator fee:') || log.includes('creatorFee:')) {
          transferFound = true;
          // Try to extract amount
          const match = log.match(/(?:creator fee|creatorFee):\s*["']?(\d+)["']?/i);
          if (match && match[1]) {
            const lamports = parseInt(match[1], 10);
            availableAmount = lamports / 1e9; // Convert to SOL
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
      
      // If we've found a transfer but couldn't determine the amount, use a minimum value
      if (transferFound && availableAmount === 0) {
        availableAmount = 0.0001; // Minimum amount
        logger.info(`Transfer detected but couldn't determine amount. Using minimum: ${availableAmount} SOL`);
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
   * Helper function to extract transfer amount from logs
   * @param {Array} logs - Transaction logs
   * @param {Number} transferIndex - Index of the transfer log
   * @returns {Number} Transfer amount in lamports
   */
  const extractTransferAmount = (logs, transferIndex) => {
    try {
      // Check the logs for amount information
      for (let i = transferIndex; i < transferIndex + 3 && i < logs.length; i++) {
        const log = logs[i];
        
        // Look for amount references
        if (log.includes('amount:') || log.includes('lamports:') || log.includes('creatorFee:')) {
          const match = log.match(/(?:amount|lamports|creatorFee):\s*(\d+)/i);
          if (match && match[1]) {
            return parseInt(match[1], 10);
          }
        }
      }
      
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