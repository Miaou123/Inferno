/**
 * Claim rewards utility for $INFERNO token
 * Automatically claims creator rewards from pump.fun
 */
const { 
  PublicKey, 
  Transaction, 
  TransactionInstruction, 
  sendAndConfirmTransaction 
} = require('@solana/web3.js');
const { 
  Token, 
  ASSOCIATED_TOKEN_PROGRAM_ID, 
  TOKEN_PROGRAM_ID 
} = require('@solana/spl-token');
const logger = require('../utils/logger').rewards;
const fileStorage = require('../utils/fileStorage');
const solana = require('../utils/solana');

/**
 * Claim rewards from pump.fun
 * @returns {Promise<Object>} Claim result
 */
const claimRewards = async () => {
  try {
    logger.info('Claiming creator rewards');
    
    // Get keypair
    const keypair = solana.createKeypair();
    
    // Create connection to Solana
    const connection = solana.getConnection();
    
    // Get the latest blockhash
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    
    // Define necessary accounts
    const solMint = new PublicKey('So11111111111111111111111111111111111111112');
    const tokenProgram = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
    const rewardProgram = new PublicKey('pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA');
    const programStateAccount = new PublicKey('GHhV8rbzfxsDQuFffQJ69keGsGRB1pE9eYt4UrxiDSF');
    const programAuthority = new PublicKey('GS4CU59F31iL7aR2Q8zVS8DRrcRnXX1yjQ66TqNVQnaR');
    
    // Get the associated token account for SOL
    const tokenAccount = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      solMint,
      keypair.publicKey
    );

    // This might be a PDA derived from your wallet or token data
    // For now, using the value from transaction analysis
    const programAccount = new PublicKey('Eo1meN9uVcqZSgfisoq3ZMM4W9fHdgnYBiRsHULVgLho');
    
    // Create transaction
    const transaction = new Transaction();
    
    // Check if token account exists and create it if needed
    const tokenAccountInfo = await connection.getAccountInfo(tokenAccount);
    if (!tokenAccountInfo) {
      // Add instruction to create associated token account
      transaction.add(
        Token.createAssociatedTokenAccountInstruction(
          ASSOCIATED_TOKEN_PROGRAM_ID,
          TOKEN_PROGRAM_ID,
          solMint,
          tokenAccount,
          keypair.publicKey,
          keypair.publicKey
        )
      );
    }
    
    // Add instruction to claim rewards
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
    
    // Sign and send transaction
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [keypair],
      {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
        commitment: 'confirmed',
      }
    );
    
    logger.info(`Claimed rewards successfully with tx: ${signature}`);
    
    // Get claimed amount
    const txDetails = await connection.getTransaction(signature, {
      commitment: 'confirmed',
    });
    
    let claimAmount = 0;
    if (txDetails && txDetails.meta) {
      // Find the SOL balance change for the token account
      const accountIndex = txDetails.transaction.message.accountKeys.findIndex(
        key => key.equals(tokenAccount)
      );
      
      if (accountIndex >= 0) {
        const preBalance = txDetails.meta.preBalances[accountIndex];
        const postBalance = txDetails.meta.postBalances[accountIndex];
        claimAmount = (postBalance - preBalance) / 1e9; // Convert lamports to SOL
      }
    }
    
    // Get USD value of claimed amount
    const { fetchTokenPrice } = require('../utils/priceOracle');
    const priceData = await fetchTokenPrice();
    const claimAmountUsd = claimAmount * priceData.solPriceInUsd;
    
    // Record the claim in storage
    const rewardRecord = {
      rewardAmount: claimAmount,
      rewardAmountUsd: claimAmountUsd,
      isProcessed: false,
      burnTxHash: null,
      timestamp: new Date().toISOString()
    };
    
    const savedReward = fileStorage.saveRecord('rewards', rewardRecord);
    
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

/**
 * Check available rewards from pump.fun
 * @returns {Promise<Object>} Available rewards info
 */
const checkAvailableRewards = async () => {
  try {
    logger.info('Checking available rewards');
    
    // This is a placeholder. In a real implementation, you would:
    // 1. Query the program account for available rewards
    // 2. Return the amount of rewards available to claim
    
    // For mock mode, return a simulated amount
    if (process.env.MOCK_MODE === 'true') {
      const mockAmount = (Math.random() * 0.5 + 0.1).toFixed(4);
      return {
        success: true,
        availableAmount: parseFloat(mockAmount),
        mockMode: true
      };
    }
    
    // Get keypair
    const keypair = solana.createKeypair();
    
    // Create connection to Solana
    const connection = solana.getConnection();
    
    // Query the program account for available rewards
    // Note: This is a placeholder implementation
    // In reality, you would need to determine the correct PDA and data structure
    const programAccount = new PublicKey('Eo1meN9uVcqZSgfisoq3ZMM4W9fHdgnYBiRsHULVgLho');
    
    try {
      const accountInfo = await connection.getAccountInfo(programAccount);
      if (accountInfo && accountInfo.data) {
        // Parse account data to determine available rewards
        // This is a placeholder - actual parsing depends on program data structure
        return {
          success: true,
          availableAmount: 0.1, // Placeholder value
          hasRewards: true
        };
      } else {
        return {
          success: true,
          availableAmount: 0,
          hasRewards: false
        };
      }
    } catch (error) {
      logger.warn(`Could not query rewards account: ${error.message}`);
      return {
        success: false,
        availableAmount: 0,
        error: error.message
      };
    }
  } catch (error) {
    logger.error('Error checking available rewards:', error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  claimRewards,
  checkAvailableRewards
};