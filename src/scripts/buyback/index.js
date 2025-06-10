/**
 * Complete Automatic Buyback and Burn Script for $INFERNO token
 * All-in-one solution to avoid circular dependencies
 * Monitors pAMMBay creator vault, claims rewards, buys back tokens, and burns them
 */
const cron = require('node-cron');
const { 
  Connection, 
  PublicKey, 
  Transaction, 
  TransactionInstruction,
  ComputeBudgetProgram,
  sendAndConfirmTransaction 
} = require('@solana/web3.js');
const logger = require('../utils/logger').buyback;
const fileStorage = require('../utils/fileStorage');
const { createKeypair, getConnection } = require('../utils/solana');
const { fetchFromDexScreener } = require('../utils/priceOracle');
const { executeBuyback } = require('./executeBuyback');
const { burnBuybackTokens } = require('./burnBuyBackTokens');

require('dotenv').config();

// Configuration from environment variables
const config = {
  rewardThreshold: parseFloat(process.env.REWARDS_CLAIM_THRESHOLD) || 0.3,
  maxSlippage: parseFloat(process.env.MAX_SLIPPAGE_PERCENT) || 3,
  buybackInterval: parseInt(process.env.BUYBACK_INTERVAL_MINUTES) || 30
};

// pAMMBay program constants
const PAMM_PROGRAM_ID = new PublicKey('pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA');
const WSOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');
const ASSOCIATED_TOKEN_PROGRAM = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
const TOKEN_PROGRAM = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

/**
 * Derive the creator vault authority PDA
 * @param {PublicKey} creator - Creator public key
 * @returns {PublicKey} Creator vault authority
 */
function getCoinCreatorVaultAuthority(creator) {
  const [pda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('creator_vault'),
      creator.toBuffer()
    ],
    PAMM_PROGRAM_ID
  );
  return pda;
}

/**
 * Derive the creator vault ATA
 * @param {PublicKey} creator - Creator public key
 * @returns {PublicKey} Creator vault ATA
 */
function getCoinCreatorVaultAta(creator) {
  const vaultAuthority = getCoinCreatorVaultAuthority(creator);
  const [pda] = PublicKey.findProgramAddressSync(
    [
      vaultAuthority.toBuffer(),
      TOKEN_PROGRAM.toBuffer(),
      WSOL_MINT.toBuffer()
    ],
    ASSOCIATED_TOKEN_PROGRAM
  );
  return pda;
}

/**
 * Derive the event authority PDA
 * @returns {PublicKey} Event authority
 */
function getEventAuthority() {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('__event_authority')],
    PAMM_PROGRAM_ID
  );
  return pda;
}

/**
 * Check for available creator rewards using pAMMBay program
 * @returns {Promise<Object>} Reward status with available amount
 */
const checkAvailableRewards = async () => {
  try {
    logger.info('Checking pAMMBay creator rewards');
    
    // Get keypair and connection
    const keypair = createKeypair();
    const connection = getConnection();
    
    // Derive required accounts
    const creator = keypair.publicKey;
    const coinCreatorVaultAta = getCoinCreatorVaultAta(creator);
    
    // Check if the vault has any balance
    try {
      const vaultInfo = await connection.getAccountInfo(coinCreatorVaultAta);
      if (!vaultInfo) {
        logger.info('Creator vault ATA does not exist - no rewards available');
        return {
          success: true,
          availableAmount: 0,
          hasRewards: false,
          message: 'Creator vault does not exist'
        };
      }
      
      // Parse the token account to get balance
      const vaultBalance = await connection.getTokenAccountBalance(coinCreatorVaultAta);
      const balanceInSol = vaultBalance.value.uiAmount || 0;
      
      logger.info(`Vault balance: ${balanceInSol} WSOL`);
      
      if (balanceInSol <= 0) {
        logger.info('Creator vault has zero balance - no rewards available');
        return {
          success: true,
          availableAmount: 0,
          hasRewards: false,
          message: 'No rewards in vault'
        };
      }
      
      // If there's a balance, we can claim it
      logger.info(`Found ${balanceInSol} WSOL in creator vault - available for claim`);
      return {
        success: true,
        availableAmount: balanceInSol,
        hasRewards: true,
        isExactAmount: true,
        vaultAddress: coinCreatorVaultAta.toString()
      };
      
    } catch (vaultError) {
      logger.warn(`Could not check vault balance: ${vaultError.message}`);
      return {
        success: false,
        availableAmount: 0,
        error: vaultError.message
      };
    }
    
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
 * Create or get associated token account instruction
 * @param {PublicKey} payer - Payer public key
 * @param {PublicKey} associatedToken - Associated token account
 * @param {PublicKey} owner - Owner public key
 * @param {PublicKey} mint - Mint public key
 * @returns {TransactionInstruction} Create ATA instruction
 */
function createAssociatedTokenAccountInstruction(payer, associatedToken, owner, mint) {
  return new TransactionInstruction({
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: associatedToken, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM, isSigner: false, isWritable: false }
    ],
    programId: ASSOCIATED_TOKEN_PROGRAM,
    data: Buffer.from([1]) // CreateIdempotent instruction
  });
}

/**
 * Claim rewards from pAMMBay creator vault
 * @returns {Promise<Object>} Claim result
 */
const claimRewards = async () => {
  try {
    logger.info('Starting pAMMBay reward claim process');
    
    // Check if rewards are available before trying to claim
    const rewardsCheck = await checkAvailableRewards();
    
    if (!rewardsCheck.success) {
      logger.error(`Failed to check rewards: ${rewardsCheck.error}`);
      return { success: false, error: rewardsCheck.error };
    }
    
    if (!rewardsCheck.hasRewards || rewardsCheck.availableAmount <= 0) {
      logger.info('No rewards available to claim');
      return { 
        success: false, 
        error: 'NO_REWARDS',
        message: rewardsCheck.message || 'No creator fee rewards available to collect' 
      };
    }
    
    logger.info(`Rewards available: ${rewardsCheck.availableAmount} WSOL. Proceeding with claim.`);
    
    // Get keypair and connection
    const keypair = createKeypair();
    const connection = getConnection();
    
    // Get the latest blockhash
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    
    // Derive required accounts
    const creator = keypair.publicKey;
    const coinCreatorVaultAuthority = getCoinCreatorVaultAuthority(creator);
    const coinCreatorVaultAta = getCoinCreatorVaultAta(creator);
    const eventAuthority = getEventAuthority();
    
    // Get creator's WSOL account (where funds will be sent)
    const [creatorTokenAccount] = PublicKey.findProgramAddressSync(
      [
        creator.toBuffer(),
        TOKEN_PROGRAM.toBuffer(),
        WSOL_MINT.toBuffer()
      ],
      ASSOCIATED_TOKEN_PROGRAM
    );
    
    // Create transaction for actual claim
    const transaction = new Transaction();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = creator;
    
    // Add compute budget instructions
    transaction.add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 })
    );
    
    transaction.add(
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100000 })
    );
    
    // Check if creator token account exists, create if not
    try {
      const accountInfo = await connection.getAccountInfo(creatorTokenAccount);
      if (!accountInfo) {
        logger.info('Creating creator WSOL token account');
        transaction.add(
          createAssociatedTokenAccountInstruction(
            creator,
            creatorTokenAccount,
            creator,
            WSOL_MINT
          )
        );
      }
    } catch (error) {
      // If we can't check, add the create instruction anyway (it's idempotent)
      logger.info('Adding create token account instruction (idempotent)');
      transaction.add(
        createAssociatedTokenAccountInstruction(
          creator,
          creatorTokenAccount,
          creator,
          WSOL_MINT
        )
      );
    }
    
    // Add collect coin creator fee instruction
    const collectInstruction = new TransactionInstruction({
      programId: PAMM_PROGRAM_ID,
      keys: [
        { pubkey: WSOL_MINT, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM, isSigner: false, isWritable: false },
        { pubkey: creator, isSigner: true, isWritable: false },
        { pubkey: coinCreatorVaultAuthority, isSigner: false, isWritable: false },
        { pubkey: coinCreatorVaultAta, isSigner: false, isWritable: true },
        { pubkey: creatorTokenAccount, isSigner: false, isWritable: true },
        { pubkey: eventAuthority, isSigner: false, isWritable: false },
        { pubkey: PAMM_PROGRAM_ID, isSigner: false, isWritable: false }
      ],
      data: Buffer.from([160, 57, 89, 42, 181, 139, 43, 66]) // collect_coin_creator_fee discriminator
    });
    
    transaction.add(collectInstruction);
    
    // Execute the transaction
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [keypair],
      {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
        commitment: 'confirmed',
        maxRetries: 3
      }
    );
    
    logger.info(`Claim transaction successful! Signature: ${signature}`);
    
    // Use the pre-checked amount
    const claimAmount = rewardsCheck.availableAmount;
    
    // Get USD value
    let claimAmountUsd = 0;
    try {
      const priceData = await fetchFromDexScreener();
      claimAmountUsd = claimAmount * priceData.solPriceInUsd;
    } catch (priceError) {
      logger.warn(`Error getting SOL price: ${priceError.message}. Using default value.`);
      claimAmountUsd = claimAmount * 400; // Fallback USD price for SOL
    }
    
    // Record the claim in storage
    const rewardRecord = {
      rewardAmount: claimAmount,
      rewardAmountUsd: claimAmountUsd,
      isProcessed: false,
      claimTxSignature: signature,
      timestamp: new Date().toISOString(),
      source: 'pAMMBay_creator_vault',
      vaultAddress: coinCreatorVaultAta.toString()
    };
    
    const savedReward = fileStorage.saveRecord('rewards', rewardRecord);
    logger.info(`Recorded reward claim in storage with ID: ${savedReward.id}`);
    
    return {
      success: true,
      amount: claimAmount,
      amountUsd: claimAmountUsd,
      txSignature: signature,
      rewardId: savedReward.id,
      explorerUrl: `https://solscan.io/tx/${signature}`
    };
    
  } catch (error) {
    logger.error('Error claiming rewards:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Execute the complete buyback and burn process
 */
const performBuybackAndBurn = async () => {
  try {
    logger.info('Starting complete buyback and burn process');
    
    // Initialize storage
    fileStorage.initializeStorage();
    
    // Step 1: Check for available rewards
    logger.info('Step 1: Checking for available rewards...');
    const rewardsInfo = await checkAvailableRewards();
    
    if (!rewardsInfo.success) {
      logger.error(`Failed to check available rewards: ${rewardsInfo.error}`);
      return { success: false, step: 'check_rewards', error: rewardsInfo.error };
    }
    
    if (!rewardsInfo.hasRewards || rewardsInfo.availableAmount <= 0) {
      logger.info('No rewards available to claim');
      return { success: false, step: 'check_rewards', message: 'No rewards available' };
    }
    
    // Check if rewards meet threshold
    if (rewardsInfo.availableAmount < config.rewardThreshold) {
      logger.info(`Rewards below threshold: ${rewardsInfo.availableAmount} SOL < ${config.rewardThreshold} SOL`);
      return { success: false, step: 'threshold_check', message: 'Rewards below threshold' };
    }
    
    logger.info(`Found ${rewardsInfo.availableAmount} SOL rewards (above ${config.rewardThreshold} SOL threshold)`);
    
    // Step 2: Claim rewards
    logger.info('Step 2: Claiming rewards...');
    const claimResult = await claimRewards();
    
    if (!claimResult.success) {
      logger.error(`Failed to claim rewards: ${claimResult.error}`);
      return { success: false, step: 'claim_rewards', error: claimResult.error };
    }
    
    logger.info(`Successfully claimed ${claimResult.amount} SOL (${claimResult.rewardId})`);
    
    // Step 3: Execute buyback
    logger.info('Step 3: Executing buyback...');
    const buybackResult = await executeBuyback(claimResult.amount, claimResult.rewardId);
    
    if (!buybackResult.success) {
      logger.error(`Failed to execute buyback: ${buybackResult.error}`);
      return { success: false, step: 'buyback', error: buybackResult.error };
    }
    
    logger.info(`Successfully bought ${buybackResult.tokenAmount.toLocaleString()} tokens with ${buybackResult.solAmount} SOL`);
    
    // Step 4: Burn tokens
    logger.info('Step 4: Burning bought tokens...');
    const burnResult = await burnBuybackTokens(
      createKeypair(),                    // Keypair parameter
      buybackResult.tokenAmount,          // Amount of tokens to burn
      process.env.TOKEN_ADDRESS,          // Token address 
      claimResult.rewardId,               // Reward ID
      buybackResult.solAmount,            // SOL amount spent
      claimResult.amountUsd,              // USD amount
      buybackResult.txSignature           // Buyback transaction signature
    );
    
    if (!burnResult.success) {
      logger.error(`Failed to burn tokens: ${burnResult.error}`);
      return { success: false, step: 'burn', error: burnResult.error };
    }
    
    logger.info(`Successfully burned ${burnResult.amount.toLocaleString()} tokens`);
    
    // Log complete success
    logger.info(`✅ Complete buyback and burn process successful!`);
    logger.info(`📊 Summary:`);
    logger.info(`   💰 SOL claimed: ${claimResult.amount}`);
    logger.info(`   🛒 Buyback TX: ${buybackResult.txSignature}`);
    logger.info(`   🪙 Tokens bought: ${buybackResult.tokenAmount.toLocaleString()}`);
    logger.info(`   🔥 Burn TX: ${burnResult.signature}`);
    logger.info(`   💥 Tokens burned: ${burnResult.amount.toLocaleString()}`);
    
    return {
      success: true,
      summary: {
        solClaimed: claimResult.amount,
        solClaimedUsd: claimResult.amountUsd,
        tokensBought: buybackResult.tokenAmount,
        tokensBurned: burnResult.amount,
        claimTx: claimResult.txSignature,
        buybackTx: buybackResult.txSignature,
        burnTx: burnResult.signature,
        rewardId: claimResult.rewardId,
        burnRecordId: burnResult.burnRecord.id
      }
    };
    
  } catch (error) {
    logger.error('Error in buyback and burn process:', error);
    return { success: false, step: 'unknown', error: error.message };
  }
};

/**
 * Start the buyback and burn monitoring process
 */
const startBuybackMonitoring = async () => {
  try {
    logger.info('🔥 Starting pAMMBay buyback and burn monitoring...');
    
    // Initialize storage
    fileStorage.initializeStorage();
    
    // Run initial buyback
    logger.info('Running initial buyback check...');
    const initialResult = await performBuybackAndBurn();
    
    if (initialResult.success) {
      logger.info('Initial buyback and burn completed successfully');
    } else {
      logger.info(`Initial check: ${initialResult.message || initialResult.error}`);
    }
    
    // Schedule regular buybacks
    const cronSchedule = `*/${config.buybackInterval} * * * *`;
    cron.schedule(cronSchedule, async () => {
      logger.info(`⏰ Running scheduled buyback and burn check (every ${config.buybackInterval} minutes)`);
      const result = await performBuybackAndBurn();
      
      if (result.success) {
        logger.info('✅ Scheduled buyback and burn completed successfully');
      } else {
        logger.info(`ℹ️ Scheduled check: ${result.message || result.error}`);
      }
    });
    
    logger.info(`🚀 Buyback and burn monitoring active!`);
    logger.info(`📋 Configuration:`);
    logger.info(`   🎯 Reward threshold: ${config.rewardThreshold} SOL`);
    logger.info(`   📊 Max slippage: ${config.maxSlippage}%`);
    logger.info(`   ⏱️  Check interval: ${config.buybackInterval} minutes`);
    logger.info(`🔍 Next check in ${config.buybackInterval} minutes...`);
    
  } catch (error) {
    logger.error(`Error starting buyback monitoring: ${error.message}`);
    process.exit(1);
  }
};

// Handle graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down buyback monitoring gracefully');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down buyback monitoring gracefully');
  process.exit(0);
});

// Start the script if it's run directly
if (require.main === module) {
  startBuybackMonitoring();
}

// Export functions for testing and importing
module.exports = {
  checkAvailableRewards,
  claimRewards,
  executeBuyback,
  burnBuybackTokens,
  performBuybackAndBurn,
  startBuybackMonitoring,
  config
};