/**
 * Claim rewards utility for $INFERNO token
 * Part of the buyback system
 */
const { 
    Connection, 
    PublicKey, 
    Transaction, 
    TransactionInstruction,
    ComputeBudgetProgram,
    SystemProgram,
    sendAndConfirmTransaction 
  } = require('@solana/web3.js');
  const logger = require('../utils/logger').buyback;
  const fileStorage = require('../utils/fileStorage');
  const { createKeypair, getConnection } = require('../utils/solana');
  const { fetchFromDexScreener } = require('../utils/priceOracle');
  const { checkAvailableRewards, getCoinAccounts } = require('./checkRewards');
  require('dotenv').config();
  
  // Constants based on successful transaction
  const COMPUTE_BUDGET_PROGRAM = new PublicKey('ComputeBudget111111111111111111111111111111');
  const COIN_PROGRAM = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
  const EVENT_AUTHORITY = new PublicKey('Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1');
  
  /**
   * Claim rewards from pump.fun
   * @returns {Promise<Object>} Claim result
   */
  const claimRewards = async () => {
    try {
      logger.info('Starting reward claim process');
      
      // Check if rewards are available before trying to claim
      const rewardsCheck = await checkAvailableRewards();
      
      if (!rewardsCheck.success) {
        logger.error(`Failed to check rewards: ${rewardsCheck.error}`);
        return { success: false, error: rewardsCheck.error };
      }
      
      if (!rewardsCheck.hasRewards && rewardsCheck.availableAmount <= 0) {
        logger.info('No rewards available to claim');
        return { 
          success: false, 
          error: 'NO_REWARDS',
          message: 'No creator fee rewards available to collect' 
        };
      }
      
      logger.info(`Rewards available: ${rewardsCheck.availableAmount} SOL. Proceeding with claim.`);
      
      // Get keypair and connection
      const keypair = createKeypair();
      const connection = getConnection();
      
      // Get the latest blockhash
      const { blockhash } = await connection.getLatestBlockhash('confirmed');
      
      // Get the necessary accounts
      const { creatorVault, creatorAddress } = getCoinAccounts();
      
      // Create transaction for actual claim
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
      
      // Execute the transaction with retry mechanism
      const maxRetries = 3;
      let retryCount = 0;
      let signature;
      
      while (retryCount < maxRetries) {
        try {
          logger.info('Sending claim transaction...');
          
          signature = await sendAndConfirmTransaction(
            connection,
            transaction,
            [keypair],
            {
              skipPreflight: false,
              preflightCommitment: 'confirmed',
              commitment: 'confirmed'
            }
          );
          
          logger.info(`Claim transaction successful! Signature: ${signature}`);
          break; // Success, exit retry loop
        } catch (txError) {
          logger.error(`Transaction error: ${txError.message}`);
          
          // Check if this is a recoverable error
          const isRateLimitError = txError.message && 
            (txError.message.includes('429') || 
             txError.message.includes('rate limit') ||
             txError.message.includes('too many requests'));
             
          if (isRateLimitError && retryCount < maxRetries - 1) {
            // Exponential backoff
            const backoffMs = Math.pow(2, retryCount) * 1000;
            logger.warn(`Rate limit reached, retrying in ${backoffMs}ms (attempt ${retryCount + 1}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, backoffMs));
            retryCount++;
          } else {
            // Non-recoverable error or max retries reached
            logger.error(`Failed to claim rewards: ${txError.message}`);
            return { 
              success: false, 
              error: txError.message
            };
          }
        }
      }
      
      if (!signature) {
        return { 
          success: false, 
          error: 'MAX_RETRIES_EXCEEDED'
        };
      }
      
      // Get transaction details to determine the actual claimed amount
      const txDetails = await connection.getTransaction(signature, {
        commitment: 'confirmed'
      });
      
      // Calculate the wallet's SOL balance change
      let claimAmount = 0;
      if (txDetails && txDetails.meta) {
        // Find wallet index
        const walletIndex = txDetails.transaction.message.accountKeys.findIndex(
          key => key.toString() === keypair.publicKey.toString()
        );
        
        if (walletIndex >= 0) {
          const preBalance = txDetails.meta.preBalances[walletIndex];
          const postBalance = txDetails.meta.postBalances[walletIndex];
          const balanceChange = postBalance - preBalance;
          
          // Account for transaction fee
          const fee = txDetails.meta.fee;
          claimAmount = (balanceChange + fee) / 1e9; // Convert lamports to SOL
        }
      }
      
      // If we couldn't determine the claim amount, use the estimated amount
      if (claimAmount <= 0) {
        claimAmount = rewardsCheck.availableAmount;
        logger.info(`Couldn't determine exact claim amount from transaction, using estimated: ${claimAmount} SOL`);
      } else {
        logger.info(`Successfully claimed ${claimAmount} SOL in rewards`);
      }
      
      // Get USD value
      let claimAmountUsd = 0;
      try {
        const priceData = await fetchFromDexScreener();
        claimAmountUsd = claimAmount * priceData.solPriceInUsd;
      } catch (priceError) {
        logger.warn(`Error getting token price: ${priceError.message}. Using default value.`);
        claimAmountUsd = claimAmount * 400; // Fallback USD price for SOL
      }
      
      // Record the claim in storage
      const rewardRecord = {
        rewardAmount: claimAmount,
        rewardAmountUsd: claimAmountUsd,
        isProcessed: false,
        claimTxSignature: signature,
        timestamp: new Date().toISOString()
      };
      
      const savedReward = fileStorage.saveRecord('rewards', rewardRecord);
      logger.info(`Recorded reward claim in storage with ID: ${savedReward.id}`);
      
      return {
        success: true,
        amount: claimAmount,
        amountUsd: claimAmountUsd,
        txSignature: signature,
        rewardId: savedReward.id
      };
    } catch (error) {
      logger.error('Error claiming rewards:', error);
      return { success: false, error: error.message };
    }
  };
  
  module.exports = {
    claimRewards
  };