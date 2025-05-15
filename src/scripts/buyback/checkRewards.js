/**
 * Check available rewards utility for $INFERNO token
 * Part of the buyback system
 */
const { 
    PublicKey, 
    Transaction, 
    TransactionInstruction 
  } = require('@solana/web3.js');
  const { 
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
    getAssociatedTokenAddress, // Use this instead of Token.getAssociatedTokenAddress
  } = require('@solana/spl-token');
  const logger = require('../utils/logger').buyback;
  const { createKeypair, getConnection } = require('../utils/solana');
  require('dotenv').config();
  
  /**
   * Check for available creator rewards using transaction simulation
   * @returns {Promise<Object>} Reward status with available amount
   */
  const checkAvailableRewards = async () => {
    try {
      logger.info('Checking for available rewards using transaction simulation');
      
      // Get keypair
      const keypair = createKeypair();
      
      // Create connection to Solana
      const connection = getConnection();
      
      // Get the latest blockhash
      const { blockhash } = await connection.getLatestBlockhash('confirmed');
      
      // Define necessary accounts (same as in claimRewards.js)
      const solMint = new PublicKey('So11111111111111111111111111111111111111112');
      const tokenProgram = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
      const rewardProgram = new PublicKey('pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA');
      const programStateAccount = new PublicKey('GHhV8rbzfxsDQuFffQJ69keGsGRB1pE9eYt4UrxiDSF');
      const programAuthority = new PublicKey('GS4CU59F31iL7aR2Q8zVS8DRrcRnXX1yjQ66TqNVQnaR');
      
      // Get the associated token account for SOL
      const tokenAccount = await getAssociatedTokenAddress(
        solMint,
        keypair.publicKey
      );
  
      // This might be a PDA derived from your wallet or token data
      const programAccount = new PublicKey('Eo1meN9uVcqZSgfisoq3ZMM4W9fHdgnYBiRsHULVgLho');
      
      // Create transaction
      const transaction = new Transaction();
      
      // Check if token account exists and create it if needed
      const tokenAccountInfo = await connection.getAccountInfo(tokenAccount);
      if (!tokenAccountInfo) {
        // Import the required function for creating associated token accounts
        const { createAssociatedTokenAccountInstruction } = require('@solana/spl-token');
        
        // Add instruction to create associated token account
        transaction.add(
          createAssociatedTokenAccountInstruction(
            keypair.publicKey, // payer
            tokenAccount,      // associated token account address
            keypair.publicKey, // owner
            solMint            // mint
          )
        );
      }
      
      // Add instruction to claim rewards - same as in claimRewards.js
      transaction.add(
        new TransactionInstruction({
          keys: [
            { pubkey: solMint, isSigner: false, isWritable: false },
            { pubkey: tokenProgram, isSigner: false, isWritable: false },
            { pubkey: keypair.publicKey, isSigner: true, isWritable: true },
            { pubkey: programAccount, isSigner: false, isWritable: false },
            { pubkey: tokenAccount, isSigner: false, isWritable: true },
            { pubkey: programStateAccount, isSigner: false, isWritable: true },
            { pubkey: programAuthority, isSigner: false, isWritable: false },
            { pubkey: rewardProgram, isSigner: false, isWritable: false },
          ],
          programId: rewardProgram,
          data: Buffer.from([160, 57, 89, 42, 181, 139, 43, 66]) // a039592ab58b2b42 in hex
        })
      );
      
      // Set recent blockhash and fee payer
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = keypair.publicKey;
      
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
      
      // Log detailed simulation results for analysis
      logger.debug('Simulation successful, analyzing results');
      if (simulationResult.value.logs && simulationResult.value.logs.length > 0) {
        logger.debug('Simulation logs:');
        simulationResult.value.logs.forEach(log => logger.debug(` - ${log}`));
      }
      
      // Extract available rewards amount from simulation results
      // For enhanced debugging and program understanding
      let availableAmount = 0;
      
      // Check account state changes to determine reward amount
      if (simulationResult.value.accounts && simulationResult.value.accounts.length > 0) {
        logger.debug(`Simulation returned ${simulationResult.value.accounts.length} accounts`);
        
        // Process token account balance changes
        // Find the token account in the simulation results
        let tokenAccountIndex = -1;
        
        for (let i = 0; i < simulationResult.value.accounts.length; i++) {
          const account = simulationResult.value.accounts[i];
          if (account && account.pubkey && account.pubkey.equals(tokenAccount)) {
            tokenAccountIndex = i;
            break;
          }
        }
        
        if (tokenAccountIndex >= 0) {
          logger.debug(`Found token account at index ${tokenAccountIndex}`);
          const simAccount = simulationResult.value.accounts[tokenAccountIndex];
          
          // Calculate the token balance change if we can get the pre and post balances
          if (simAccount && simAccount.lamports && tokenAccountInfo) {
            const preBalance = tokenAccountInfo.lamports;
            const postBalance = simAccount.lamports;
            const balanceChange = postBalance - preBalance;
            
            // Convert lamports to SOL
            availableAmount = balanceChange / 1e9;
            logger.debug(`Detected token account change: ${balanceChange} lamports (${availableAmount} SOL)`);
          }
        }
      }
      
      if (availableAmount > 0) {
        logger.info(`Available rewards detected: ${availableAmount} SOL`);
      } else {
        // Look at unitsConsumed as another indicator of available rewards
        if (simulationResult.value.unitsConsumed > 0) {
          logger.debug(`Transaction would consume ${simulationResult.value.unitsConsumed} compute units`);
          
          // If compute units are used but we detected no balance change,
          // this might indicate a token program operation that doesn't transfer tokens
          if (simulationResult.value.unitsConsumed > 1000) {
            logger.info('Transaction simulation consumed significant compute units, indicating potential activity');
          }
        }
        
        logger.info('No rewards detected from simulation');
      }
      
      return {
        success: true,
        availableAmount,
        hasRewards: availableAmount > 0,
        simulationDetails: {
          unitsConsumed: simulationResult.value.unitsConsumed || 0,
          logCount: (simulationResult.value.logs || []).length
        }
      };
    } catch (error) {
      logger.error('Error checking available rewards:', error);
      return { 
        success: false, 
        availableAmount: 0,
        error: error.message 
      };
    }
  };
  
  module.exports = {
    checkAvailableRewards
  };