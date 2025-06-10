/**
 * Fixed Claim rewards utility for $INFERNO token using pAMMBay
 * Updated to work with the pAMMBay program (pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA)
 */
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
const { 
  checkAvailableRewards, 
  getCoinCreatorVaultAuthority,
  getCoinCreatorVaultAta,
  getEventAuthority,
  PAMM_PROGRAM_ID,
  WSOL_MINT,
  TOKEN_PROGRAM,
  ASSOCIATED_TOKEN_PROGRAM
} = require('./checkRewards');
require('dotenv').config();

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
    
    logger.info(`Creator: ${creator.toString()}`);
    logger.info(`Creator Token Account: ${creatorTokenAccount.toString()}`);
    
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
    
    // Add collect coin creator fee instruction (from pAMMBay IDL)
    const collectInstruction = new TransactionInstruction({
      programId: PAMM_PROGRAM_ID,
      keys: [
        { pubkey: WSOL_MINT, isSigner: false, isWritable: false },                    // quote_mint
        { pubkey: TOKEN_PROGRAM, isSigner: false, isWritable: false },               // quote_token_program
        { pubkey: creator, isSigner: true, isWritable: false },                      // coin_creator
        { pubkey: coinCreatorVaultAuthority, isSigner: false, isWritable: false },   // coin_creator_vault_authority
        { pubkey: coinCreatorVaultAta, isSigner: false, isWritable: true },          // coin_creator_vault_ata
        { pubkey: creatorTokenAccount, isSigner: false, isWritable: true },          // coin_creator_token_account
        { pubkey: eventAuthority, isSigner: false, isWritable: false },              // event_authority
        { pubkey: PAMM_PROGRAM_ID, isSigner: false, isWritable: false }              // program
      ],
      data: Buffer.from([160, 57, 89, 42, 181, 139, 43, 66]) // collect_coin_creator_fee discriminator
    });
    
    transaction.add(collectInstruction);
    
    // Execute the transaction with retry mechanism
    const maxRetries = 3;
    let retryCount = 0;
    let signature;
    
    while (retryCount < maxRetries) {
      try {
        logger.info(`Sending claim transaction (attempt ${retryCount + 1}/${maxRetries})...`);
        
        signature = await sendAndConfirmTransaction(
          connection,
          transaction,
          [keypair],
          {
            skipPreflight: false,
            preflightCommitment: 'confirmed',
            commitment: 'confirmed',
            maxRetries: 2
          }
        );
        
        logger.info(`Claim transaction successful! Signature: ${signature}`);
        break; // Success, exit retry loop
        
      } catch (txError) {
        logger.error(`Transaction error (attempt ${retryCount + 1}): ${txError.message}`);
        
        // Check if this is a recoverable error
        const isRateLimitError = txError.message && 
          (txError.message.includes('429') || 
           txError.message.includes('rate limit') ||
           txError.message.includes('too many requests'));
           
        const isBlockhashError = txError.message &&
          txError.message.includes('blockhash not found');
           
        if ((isRateLimitError || isBlockhashError) && retryCount < maxRetries - 1) {
          // Exponential backoff
          const backoffMs = Math.pow(2, retryCount) * 1000;
          logger.warn(`Recoverable error, retrying in ${backoffMs}ms...`);
          
          // Get new blockhash if needed
          if (isBlockhashError) {
            const { blockhash: newBlockhash } = await connection.getLatestBlockhash('confirmed');
            transaction.recentBlockhash = newBlockhash;
            logger.info('Updated transaction with new blockhash');
          }
          
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
    let claimAmount = rewardsCheck.availableAmount; // Use the amount we detected earlier
    
    try {
      // Add a small delay to ensure the transaction is indexed
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const txDetails = await connection.getTransaction(signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0
      });
      
      if (txDetails && txDetails.meta && txDetails.meta.postTokenBalances) {
        // Look for the creator's WSOL account balance change
        const postBalance = txDetails.meta.postTokenBalances.find(
          balance => balance.accountIndex !== undefined && 
                    balance.owner === creator.toString() &&
                    balance.mint === WSOL_MINT.toString()
        );
        
        const preBalance = txDetails.meta.preTokenBalances?.find(
          balance => balance.accountIndex !== undefined && 
                    balance.owner === creator.toString() &&
                    balance.mint === WSOL_MINT.toString()
        );
        
        if (postBalance && preBalance) {
          const preAmount = parseFloat(preBalance.uiTokenAmount.uiAmountString || '0');
          const postAmount = parseFloat(postBalance.uiTokenAmount.uiAmountString || '0');
          const actualClaimed = postAmount - preAmount;
          
          if (actualClaimed > 0) {
            claimAmount = actualClaimed;
            logger.info(`Actual claimed amount from transaction: ${claimAmount} WSOL`);
          }
        } else if (postBalance) {
          // If no pre-balance, the post-balance is the claimed amount
          claimAmount = parseFloat(postBalance.uiTokenAmount.uiAmountString || '0');
          logger.info(`Claimed amount from final balance: ${claimAmount} WSOL`);
        }
      }
    } catch (detailsError) {
      logger.warn(`Could not get exact claim amount from transaction: ${detailsError.message}. Using estimated amount.`);
    }
    
    logger.info(`Successfully claimed ${claimAmount} WSOL in rewards`);
    
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
 * Alias for claimRewards to match your existing code
 */
const claimMaximumRewards = claimRewards;

module.exports = {
  claimRewards,
  claimMaximumRewards
};