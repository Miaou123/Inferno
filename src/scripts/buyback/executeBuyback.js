/**
 * Buyback execution utility for $INFERNO token
 * Part of the buyback system - With working instruction format
 */
const { 
    Connection, 
    PublicKey, 
    Transaction, 
    sendAndConfirmTransaction,
    TransactionInstruction,
    ComputeBudgetProgram
  } = require('@solana/web3.js');
  const bs58 = require('bs58');
  const logger = require('../utils/logger').buyback;
  const fileStorage = require('../utils/fileStorage');
  const { createKeypair, getConnection } = require('../utils/solana');
  const { fetchTokenPrice } = require('../utils/priceOracle');
  require('dotenv').config();
  
  // Configuration from environment variables
  const config = {
    maxSlippage: parseFloat(process.env.MAX_SLIPPAGE_PERCENT) || 5, // Default to 5% slippage
    testMode: process.env.TEST_MODE === 'true' || false
  };
  
  /**
   * Execute token buyback using SOL
   * @param {Number} solAmount - Amount of SOL to use for buyback
   * @param {String} rewardId - Storage ID of the reward record
   * @returns {Promise<Object>} Buyback result
   */
  const executeBuyback = async (solAmount, rewardId) => {
    try {
      // Validate inputs
      if (!solAmount || isNaN(solAmount) || solAmount <= 0) {
        throw new Error(`Invalid SOL amount: ${solAmount}`);
      }
      
      if (!rewardId) {
        throw new Error('Reward ID is required');
      }
      
      // Use only 95% of the SOL for buyback to maintain reserve for transaction fees
      const buybackSolAmount = solAmount * 0.95;
      logger.info(`Executing buyback with ${buybackSolAmount} SOL (95% of ${solAmount} SOL, reserving 5% for fees)`);
      
      // Get keypair and connection
      const keypair = createKeypair();
      const connection = getConnection();
      
      // Token address
      const tokenAddress = process.env.TOKEN_ADDRESS || '4aLyGDChFFmyhXcSpJDJnbQSJ9jfABrqJyLufFTGpump';
      const tokenMint = new PublicKey(tokenAddress);
      
      logger.info(`Keypair public key: ${keypair.publicKey.toString()}`);
      logger.info(`Token address: ${tokenAddress}`);
      
      // Creator vault
      const creatorVaultAddress = process.env.CREATOR_VAULT || 'ANYekpdHFWSmVzEt9iBeLFMFeQiPGjcZexFkLprtcCHj';
      logger.info(`Creator vault address: ${creatorVaultAddress}`);
      
      // In test mode, simulate a successful buyback
      if (config.testMode) {
        logger.info('TEST MODE: Simulating buyback transaction');
        
        // Simulate a successful transaction
        const txSignature = `simulated_buyback_tx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        const tokenAmount = Math.floor(buybackSolAmount * 100000); // Simulate 1 SOL = 100,000 tokens
        
        // Update the reward record
        const rewards = fileStorage.readData(fileStorage.FILES.rewards);
        const updatedRewards = rewards.map(r => {
          if (r.id === rewardId) {
            return {
              ...r,
              tokensBought: tokenAmount,
              buyTxSignature: txSignature,
              solAmountUsed: buybackSolAmount,
              solAmountReserved: solAmount - buybackSolAmount,
              status: 'bought',
              updatedAt: new Date().toISOString()
            };
          }
          return r;
        });
        
        fileStorage.writeData(fileStorage.FILES.rewards, updatedRewards);
        
        // Create token buy record
        const buyRecord = {
          timestamp: new Date().toISOString(),
          tokenAddress,
          solAmount: buybackSolAmount,
          tokenAmount: tokenAmount,
          txSignature,
          wallet: keypair.publicKey.toString(),
          type: 'buyback',
          rewardId,
          mockMode: true
        };
        
        fileStorage.saveRecord('tokenBuys', buyRecord);
        
        logger.info(`TEST MODE: Simulated buying ${tokenAmount.toLocaleString()} tokens with ${buybackSolAmount} SOL (tx: ${txSignature})`);
        
        // Return simulated result
        return {
          success: true,
          tokenAmount: tokenAmount,
          solAmount: buybackSolAmount,
          solAmountReserved: solAmount - buybackSolAmount,
          txSignature,
          testMode: true
        };
      }
      
      // For testing on devnet, create a simulated result
      if (process.env.SOLANA_RPC_URL && process.env.SOLANA_RPC_URL.includes('devnet')) {
        logger.warn('Using devnet - creating simulated transaction instead of real swap');
        
        // Simulate a successful transaction
        const txSignature = `simulated_tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const tokenAmount = Math.floor(buybackSolAmount * 100000); // Simulate 1 SOL = 100,000 tokens
        
        // Update the reward record
        const rewards = fileStorage.readData(fileStorage.FILES.rewards);
        const updatedRewards = rewards.map(r => {
          if (r.id === rewardId) {
            return {
              ...r,
              tokensBought: tokenAmount,
              buyTxSignature: txSignature,
              solAmountUsed: buybackSolAmount,
              solAmountReserved: solAmount - buybackSolAmount,
              status: 'bought',
              updatedAt: new Date().toISOString()
            };
          }
          return r;
        });
        
        fileStorage.writeData(fileStorage.FILES.rewards, updatedRewards);
        
        // Create token buy record
        const buyRecord = {
          timestamp: new Date().toISOString(),
          tokenAddress,
          solAmount: buybackSolAmount,
          tokenAmount: tokenAmount,
          txSignature,
          wallet: keypair.publicKey.toString(),
          type: 'buyback',
          rewardId,
          devnet: true
        };
        
        fileStorage.saveRecord('tokenBuys', buyRecord);
        
        return {
          success: true,
          tokenAmount: tokenAmount,
          solAmount: buybackSolAmount,
          solAmountReserved: solAmount - buybackSolAmount,
          txSignature,
          simulated: true
        };
      }
      
      // REAL TRANSACTION EXECUTION
      logger.info(`Preparing to execute swap on pump.fun: ${buybackSolAmount} SOL → ${tokenAddress}`);
      
      try {
        // Fetch token price information for calculating slippage
        logger.info(`Fetching token price for slippage calculation (${config.maxSlippage}% slippage tolerance)`);
        const priceData = await fetchTokenPrice();
        const tokenPriceInSol = priceData.tokenPriceInSol;
        
        logger.info(`Current token price: ${tokenPriceInSol} SOL per token (${priceData.tokenPriceInUsd} USD)`);
        
        // Get the latest blockhash
        const { blockhash } = await connection.getLatestBlockhash('confirmed');
        
        // Create transaction
        const transaction = new Transaction();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = keypair.publicKey;
        
        // Add compute budget instructions
        // 1. Set compute unit limit 
        transaction.add(
          ComputeBudgetProgram.setComputeUnitLimit({
            units: 48720
          })
        );
        
        // 2. Set compute unit price
        transaction.add(
          ComputeBudgetProgram.setComputeUnitPrice({
            microLamports: 1624494
          })
        );
        
        // Define necessary addresses
        const PUMP_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
        const SYSTEM_PROGRAM_ID = new PublicKey('11111111111111111111111111111111');
        const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
        const EVENT_AUTHORITY = new PublicKey('Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1');
        
        // Use fixed addresses from successful transactions
        const stateAccountInfo = new PublicKey('4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf');
        const stateAccount = new PublicKey('CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM');
        const creator = new PublicKey('CPLnZDbHTrCqY3Tvzvk1VmYNuGHwmyfQwQ6gBhd6pHmc');
        
        // Use provided addresses
        const creatorFeeAccount = new PublicKey(creatorVaultAddress);
        
        // For the user's token account, we need to derive it for the token mint
        // First check if user has an existing account
        let buyerTokenAccount;
        try {
          const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
            keypair.publicKey,
            { mint: tokenMint }
          );
          
          if (tokenAccounts.value.length > 0) {
            buyerTokenAccount = tokenAccounts.value[0].pubkey;
            logger.info(`Found existing token account: ${buyerTokenAccount.toString()}`);
          } else {
            // If no token account exists, create an address that will be created during the transaction
            // Use a fixed address from the sample transaction for safety
            buyerTokenAccount = new PublicKey('A3esEVbFFJy1BbHznygcVuepBFDRvva28EPE8ocNCN4h');
            logger.info(`No token account found, will use placeholder: ${buyerTokenAccount.toString()}`);
          }
        } catch (error) {
          logger.warn(`Error checking token accounts: ${error.message}`);
          buyerTokenAccount = new PublicKey('A3esEVbFFJy1BbHznygcVuepBFDRvva28EPE8ocNCN4h');
        }
        
        // For the creator's token account, use the fixed address from the working transaction
        const creatorTokenAccount = new PublicKey('9h3N8R7wMoNo787DF3n5Zx5nWyNXDtcUfaxmT2g5yxSV');
        
        // Convert SOL amount to lamports (whole number)
        const lamports = Math.floor(buybackSolAmount * 1000000000);
        
        // IMPORTANT: Create the buy instruction data with proper discriminator
        // The instruction discriminator for "Buy" from the working example
        const discriminator = Buffer.from([102, 6, 61, 18, 1, 218, 235, 234]);
        
        // SOL amount as little-endian 64-bit integer buffer
        const solAmountBuffer = Buffer.alloc(8);
        solAmountBuffer.writeBigUInt64LE(BigInt(lamports));
        
        // Calculate minimum tokens to receive with slippage tolerance
        // Calculate expected token amount
        const expectedTokens = buybackSolAmount / tokenPriceInSol;
        
        // Apply slippage tolerance (e.g., 5% slippage = 95% of expected amount)
        const slippageMultiplier = 1 - (config.maxSlippage / 100);
        const minTokensWithSlippage = Math.floor(expectedTokens * slippageMultiplier);
        
        // Convert to token units (accounting for decimals, usually 6 for Solana)
        const decimals = 6; // Typical for most Solana tokens
        const minTokensInSmallestUnit = BigInt(Math.floor(minTokensWithSlippage * (10 ** decimals)));
        
        // Convert min tokens to little-endian buffer
        const minOutputBuffer = Buffer.alloc(8);
        minOutputBuffer.writeBigUInt64LE(minTokensInSmallestUnit);
        
        // Combine all parts into the final instruction data
        const instructionData = Buffer.concat([
          discriminator,      // 8 bytes - instruction discriminator 
          solAmountBuffer,    // 8 bytes - SOL amount in lamports
          minOutputBuffer     // 8 bytes - minimum tokens to receive
        ]);
        
        logger.info(`Expected tokens: ${expectedTokens}`);
        logger.info(`Min tokens with ${config.maxSlippage}% slippage: ${minTokensWithSlippage}`);
        logger.info(`Min tokens in smallest unit: ${minTokensInSmallestUnit}`);
        logger.info(`Instruction data (hex): ${instructionData.toString('hex')}`);
        logger.info(`Instruction data (base58): ${bs58.encode(instructionData)}`);
        
        // Ensure accounts are in the EXACT order from the working transaction
        const accounts = [
          { pubkey: stateAccountInfo, isSigner: false, isWritable: true },
          { pubkey: stateAccount, isSigner: false, isWritable: true },
          { pubkey: tokenMint, isSigner: false, isWritable: true },
          { pubkey: creator, isSigner: false, isWritable: true },
          { pubkey: creatorTokenAccount, isSigner: false, isWritable: true },
          { pubkey: buyerTokenAccount, isSigner: false, isWritable: true },
          { pubkey: keypair.publicKey, isSigner: true, isWritable: true },
          { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: creatorFeeAccount, isSigner: false, isWritable: true },
          { pubkey: EVENT_AUTHORITY, isSigner: false, isWritable: false },
          { pubkey: PUMP_PROGRAM_ID, isSigner: false, isWritable: false }
        ];
        
        // Create the buy instruction
        const buyInstruction = new TransactionInstruction({
          programId: PUMP_PROGRAM_ID,
          keys: accounts,
          data: instructionData
        });
        
        // Add the instruction to the transaction
        transaction.add(buyInstruction);
        
        // Sign and send the transaction
        logger.info('Sending pump.fun swap transaction...');
        
        // First simulate to check for errors
        try {
          const simulation = await connection.simulateTransaction(transaction);
          if (simulation.value.err) {
            logger.error(`Simulation failed. Message: ${JSON.stringify(simulation.value.err)}`);
            logger.error(`Logs: \n${simulation.value.logs?.join('\n')}`);
            throw new Error(`Simulation failed. Message: ${JSON.stringify(simulation.value.err)}. Logs: \n${simulation.value.logs?.join('\n')}`);
          }
          logger.info('Simulation successful, proceeding with transaction');
        } catch (simError) {
          logger.error(`Error simulating transaction: ${simError.message}`);
          throw simError;
        }
        
        const txSignature = await sendAndConfirmTransaction(
          connection,
          transaction,
          [keypair],
          {
            skipPreflight: false,
            preflightCommitment: 'confirmed',
            maxRetries: 3
          }
        );
        
        logger.info(`Swap transaction successful! Signature: ${txSignature}`);
        
        // Get transaction details to determine token amount received
        const txDetails = await connection.getTransaction(txSignature, {
          commitment: 'confirmed',
          maxSupportedTransactionVersion: 0
        });
        
        // Find the token account in the post balances and determine amount received
        let tokenAmount = 0;
        if (txDetails && txDetails.meta && txDetails.meta.postTokenBalances) {
          // Find the buyer's token account in the post balances
          const buyerTokenBalance = txDetails.meta.postTokenBalances.find(balance => 
            balance.owner === keypair.publicKey.toString()
          );
          
          if (buyerTokenBalance) {
            tokenAmount = Number(buyerTokenBalance.uiTokenAmount.amount) / 
                           Math.pow(10, buyerTokenBalance.uiTokenAmount.decimals);
            logger.info(`Received ${tokenAmount} tokens`);
          }
        }
        
        // If we couldn't determine the amount, estimate based on a typical rate
        if (tokenAmount === 0) {
          tokenAmount = buybackSolAmount * 100000; // Estimate 1 SOL ≈ 100,000 tokens
          logger.warn(`Couldn't determine exact token amount from transaction, estimating: ${tokenAmount}`);
        }
        
        // Update the reward record
        const rewards = fileStorage.readData(fileStorage.FILES.rewards);
        const updatedRewards = rewards.map(r => {
          if (r.id === rewardId) {
            return {
              ...r,
              tokensBought: tokenAmount,
              buyTxSignature: txSignature,
              solAmountUsed: buybackSolAmount,
              solAmountReserved: solAmount - buybackSolAmount,
              status: 'bought',
              updatedAt: new Date().toISOString()
            };
          }
          return r;
        });
        
        fileStorage.writeData(fileStorage.FILES.rewards, updatedRewards);
        
        // Create token buy record
        const buyRecord = {
          timestamp: new Date().toISOString(),
          tokenAddress,
          solAmount: buybackSolAmount,
          tokenAmount: tokenAmount,
          txSignature,
          wallet: keypair.publicKey.toString(),
          type: 'buyback',
          rewardId
        };
        
        fileStorage.saveRecord('tokenBuys', buyRecord);
        
        logger.info(`Successfully bought ${tokenAmount.toLocaleString()} tokens with ${buybackSolAmount} SOL (tx: ${txSignature})`);
        
        return {
          success: true,
          tokenAmount: tokenAmount,
          solAmount: buybackSolAmount,
          solAmountReserved: solAmount - buybackSolAmount,
          txSignature
        };
      } catch (swapError) {
        logger.error(`Error executing swap: ${swapError.message}`);
        throw new Error(`Failed to execute swap: ${swapError.message}`);
      }
    } catch (error) {
      logger.error('Error executing buyback:', error);
      
      // Update reward record with error
      if (rewardId) {
        const rewards = fileStorage.readData(fileStorage.FILES.rewards);
        const updatedRewards = rewards.map(r => {
          if (r.id === rewardId) {
            return {
              ...r,
              status: 'failed',
              errorMessage: error.message,
              updatedAt: new Date().toISOString()
            };
          }
          return r;
        });
        
        fileStorage.writeData(fileStorage.FILES.rewards, updatedRewards);
      }
      
      return { 
        success: false, 
        error: error.message 
      };
    }
  };
  
  module.exports = {
    executeBuyback
  };