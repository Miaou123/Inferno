/**
 * Clean Buyback and Burn Script for $INFERNO token
 * Uses pAMMBay creator vault WSOL balance checking and claiming
 */
const cron = require('node-cron');
const { Connection, PublicKey, Transaction, TransactionInstruction, VersionedTransaction } = require('@solana/web3.js');
const { getAccount, burn, getOrCreateAssociatedTokenAccount, getMint } = require('@solana/spl-token');
const axios = require('axios');
const logger = require('../utils/logger').buyback;
const fileStorage = require('../utils/fileStorage');
const { createKeypair, getConnection } = require('../utils/solana');
const config = require('./config');

require('dotenv').config();

class BuybackSystem {
  constructor() {
    this.connection = getConnection();
    this.keypair = createKeypair();
  }

  /**
   * Check available WSOL balance in pAMMBay creator vault
   */
  async checkRewardsBalance() {
    try {
      logger.info('Checking pAMMBay creator rewards');
      logger.debug(`Using vault address: ${config.vaultAddress}`);
      
      const vaultPubkey = new PublicKey(config.vaultAddress);
      
      // First check if the account exists at all
      const accountInfo = await this.connection.getAccountInfo(vaultPubkey);
      
      if (!accountInfo) {
        logger.warn(`Vault account ${config.vaultAddress} not found`);
        return {
          success: true,
          balance: 0,
          hasEnoughRewards: false
        };
      }
      
      logger.debug(`Account found - Owner: ${accountInfo.owner.toString()}, Data length: ${accountInfo.data.length}`);
      
      let balance = 0;
      
      // Check if it's a token account (SPL Token Program)
      if (accountInfo.owner.toString() === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') {
        try {
          const vaultAccount = await getAccount(this.connection, vaultPubkey);
          balance = Number(vaultAccount.amount) / 1e9;
          logger.info(`Token account balance: ${balance.toFixed(9)} WSOL`);
        } catch (tokenError) {
          logger.error(`Failed to read as token account: ${tokenError.message}`);
          return {
            success: false,
            error: tokenError.message,
            balance: 0,
            hasEnoughRewards: false
          };
        }
      }
      // Check if it's a regular SOL account (System Program)
      else if (accountInfo.owner.toString() === '11111111111111111111111111111111') {
        balance = accountInfo.lamports / 1e9;
        logger.info(`SOL account balance: ${balance.toFixed(9)} SOL`);
      }
      // If it's owned by another program, try to decode the data
      else {
        logger.info(`Program-owned account: ${accountInfo.owner.toString()}`);
        
        // Try to find balance in account data at common offsets
        if (accountInfo.data.length >= 8) {
          const offsets = [0, 8, 16, 32, 40, 48, 56];
          let found = false;
          
          for (const offset of offsets) {
            if (accountInfo.data.length >= offset + 8) {
              try {
                const value = accountInfo.data.readBigUInt64LE(offset);
                const candidateBalance = Number(value) / 1e9;
                
                // Check if this looks like a reasonable balance
                if (candidateBalance >= 0.001 && candidateBalance <= 1000) {
                  balance = candidateBalance;
                  logger.info(`Found balance at offset ${offset}: ${balance.toFixed(9)} SOL`);
                  found = true;
                  break;
                }
              } catch (e) {
                // Continue to next offset
              }
            }
          }
          
          if (!found) {
            logger.warn('Could not decode balance from program account data');
            // Log raw data for debugging
            logger.debug(`Account data (first 64 bytes): ${accountInfo.data.slice(0, 64).toString('hex')}`);
          }
        }
      }
      
      const hasEnoughRewards = balance >= config.rewardThreshold;
      
      if (hasEnoughRewards) {
        logger.info(`Found ${balance.toFixed(9)} SOL in creator vault - available for claim`);
      } else {
        logger.info(`Rewards below threshold: ${balance.toFixed(9)} SOL < ${config.rewardThreshold} SOL`);
      }
      
      return {
        success: true,
        balance,
        hasEnoughRewards
      };
      
    } catch (error) {
      logger.error('Error checking vault balance:', error);
      return { 
        success: false, 
        error: error.message, 
        balance: 0,
        hasEnoughRewards: false 
      };
    }
  }

  /**
   * Claim WSOL rewards from pAMMBay creator vault
   */
  async claimCreatorRewards(amount) {
    try {
      logger.info(`Claiming ${amount} WSOL from creator vault`);
      
      const vaultPubkey = new PublicKey(config.vaultAddress);
      const authorityPubkey = new PublicKey(config.authorityAddress);
      
      // Create claim transaction
      const transaction = new Transaction();
      
      // Add compute budget instructions
      transaction.add(
        new TransactionInstruction({
          programId: new PublicKey('ComputeBudget111111111111111111111111111111'),
          keys: [],
          data: Buffer.from([2, ...new Uint8Array(new BigUint64Array([BigInt(config.computeUnits)]).buffer)])
        })
      );
      
      transaction.add(
        new TransactionInstruction({
          programId: new PublicKey('ComputeBudget111111111111111111111111111111'),
          keys: [],
          data: Buffer.from([3, ...new Uint8Array(new BigUint64Array([BigInt(config.computeUnitPrice)]).buffer)])
        })
      );
      
      // Add main withdraw instruction
      transaction.add(
        new TransactionInstruction({
          programId: new PublicKey('pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA'),
          keys: [
            { pubkey: this.keypair.publicKey, isSigner: true, isWritable: true },
            { pubkey: vaultPubkey, isSigner: false, isWritable: true },
            { pubkey: authorityPubkey, isSigner: false, isWritable: false }
          ],
          data: Buffer.from([/* your claim instruction data */])
        })
      );
      
      const signature = await this.connection.sendTransaction(transaction, [this.keypair]);
      await this.connection.confirmTransaction(signature);
      
      logger.info(`Successfully claimed rewards: ${signature}`);
      
      return {
        success: true,
        signature,
        amount
      };
    } catch (error) {
      logger.error('Error claiming rewards:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Execute token buyback using Jupiter API
   */
  async executeBuyback(solAmount, rewardId) {
    try {
      const buybackAmount = solAmount * config.buybackSafetyBuffer;
      const lamports = Math.floor(buybackAmount * 1_000_000_000);
      
      logger.info(`Executing buyback with ${buybackAmount} SOL (${config.buybackSafetyBuffer * 100}% of ${solAmount})`);
      
      // Get Jupiter quote
      const quoteUrl = `https://quote-api.jup.ag/v6/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=${process.env.TOKEN_ADDRESS}&amount=${lamports}&slippageBps=${config.maxSlippage * 100}`;
      const quoteResponse = await axios.get(quoteUrl);
      const quote = quoteResponse.data;
      
      if (!quote) {
        throw new Error('Failed to get Jupiter quote');
      }
      
      const expectedTokens = parseFloat(quote.outAmount) / 1e6; // Assuming 6 decimals
      
      // Get swap transaction
      const swapResponse = await axios.post('https://quote-api.jup.ag/v6/swap', {
        quoteResponse: quote,
        userPublicKey: this.keypair.publicKey.toString(),
        wrapAndUnwrapSol: true
      });
      
      if (!swapResponse.data?.swapTransaction) {
        throw new Error('Failed to get swap transaction');
      }
      
      // Execute swap
      const transaction = VersionedTransaction.deserialize(
        Buffer.from(swapResponse.data.swapTransaction, 'base64')
      );
      
      transaction.sign([this.keypair]);
      const signature = await this.connection.sendRawTransaction(transaction.serialize());
      await this.connection.confirmTransaction(signature);
      
      logger.info(`Buyback successful! Got ${expectedTokens} tokens for ${buybackAmount} SOL: ${signature}`);
      
      return {
        success: true,
        txSignature: signature,
        tokenAmount: expectedTokens,
        solAmount: buybackAmount
      };
    } catch (error) {
      logger.error('Buyback failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Burn bought tokens using SPL token burn
   */
  async burnBuybackTokens(tokenAmount, buybackTxSignature, rewardId, solSpent, usdAmount) {
    try {
      const safeAmount = Math.floor(tokenAmount * config.burnSafetyBuffer);
      const tokenMint = new PublicKey(process.env.TOKEN_ADDRESS);
      
      logger.info(`Burning ${safeAmount} tokens (${config.burnSafetyBuffer * 100}% of ${tokenAmount})`);
      
      // Get token account
      const tokenAccount = await getOrCreateAssociatedTokenAccount(
        this.connection,
        this.keypair,
        tokenMint,
        this.keypair.publicKey
      );
      
      // Get mint info for decimals
      const mintInfo = await getMint(this.connection, tokenMint);
      const rawAmount = safeAmount * Math.pow(10, mintInfo.decimals);
      
      // Check balance
      if (tokenAccount.amount < rawAmount) {
        throw new Error(`Insufficient tokens: need ${safeAmount}, have ${tokenAccount.amount / Math.pow(10, mintInfo.decimals)}`);
      }
      
      // Execute burn
      const signature = await burn(
        this.connection,
        this.keypair,
        tokenAccount.address,
        tokenMint,
        this.keypair,
        rawAmount
      );
      
      logger.info(`Successfully burned ${safeAmount} tokens: ${signature}`);
      
      // Record the burn
      const burnRecord = fileStorage.saveRecord('burns', {
        burnType: 'buyback',
        burnAmount: safeAmount,
        txSignature: signature,
        buybackTxSignature,
        rewardId,
        solSpent,
        solSpentUsd: usdAmount,
        initiator: 'buyback-script',
        timestamp: new Date().toISOString()
      });
      
      // Update reward record
      if (rewardId) {
        const rewards = fileStorage.readData(fileStorage.FILES.rewards);
        const updatedRewards = rewards.map(r => {
          if (r.id === rewardId) {
            return {
              ...r,
              tokensBurned: safeAmount,
              burnTxSignature: signature,
              buybackTxSignature,
              status: 'burned',
              updatedAt: new Date().toISOString()
            };
          }
          return r;
        });
        fileStorage.writeData(fileStorage.FILES.rewards, updatedRewards);
      }
      
      return {
        success: true,
        signature,
        amount: safeAmount,
        burnRecord
      };
    } catch (error) {
      logger.error('Burn failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Complete buyback and burn cycle
   */
  async performBuybackAndBurn() {
    try {
      logger.info('🔥 Starting buyback cycle');
      fileStorage.initializeStorage();
      
      // Step 1: Check rewards
      const rewardCheck = await this.checkRewardsBalance();
      if (!rewardCheck.success || !rewardCheck.hasEnoughRewards) {
        logger.info(`Rewards below threshold: ${rewardCheck.balance} < ${config.rewardThreshold} SOL`);
        return;
      }
      
      // Step 2: Claim rewards
      const claimResult = await this.claimCreatorRewards(rewardCheck.balance);
      if (!claimResult.success) {
        logger.error(`Failed to claim rewards: ${claimResult.error}`);
        return;
      }
      
      // Record the reward
      const rewardRecord = fileStorage.saveRecord('rewards', {
        amount: claimResult.amount,
        claimTxSignature: claimResult.signature,
        status: 'claimed',
        timestamp: new Date().toISOString()
      });
      
      // Step 3: Execute buyback
      const buybackResult = await this.executeBuyback(claimResult.amount, rewardRecord.id);
      if (!buybackResult.success) {
        logger.error(`Failed to execute buyback: ${buybackResult.error}`);
        return;
      }
      
      // Step 4: Burn tokens
      const burnResult = await this.burnBuybackTokens(
        buybackResult.tokenAmount,
        buybackResult.txSignature,
        rewardRecord.id,
        buybackResult.solAmount,
        buybackResult.solAmount * 100 // Approximate USD
      );
      
      if (burnResult.success) {
        logger.info(`🔥 Complete cycle successful! Burned ${burnResult.amount} tokens`);
      } else {
        logger.error(`Failed to burn tokens: ${burnResult.error}`);
      }
      
    } catch (error) {
      logger.error('Buyback cycle failed:', error);
    }
  }

  /**
   * Start monitoring and periodic execution
   */
  async start() {
    logger.info('🔥 Starting pAMMBay buyback and burn monitoring...');
    
    // Run initial check
    logger.info('Running initial buyback check...');
    await this.performBuybackAndBurn();
    
    // Schedule regular checks
    cron.schedule(`*/${config.checkIntervalMinutes} * * * *`, async () => {
      logger.info('Running scheduled buyback check');
      await this.performBuybackAndBurn();
    });
    
    logger.info('🚀 Buyback and burn monitoring active!');
    logger.info('📋 Configuration:');
    logger.info(`   🎯 Reward threshold: ${config.rewardThreshold} SOL`);
    logger.info(`   📊 Max slippage: ${config.maxSlippage}%`);
    logger.info(`   ⏱️  Check interval: ${config.checkIntervalMinutes} minutes`);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully');
  process.exit(0);
});

// Start if run directly
if (require.main === module) {
  const system = new BuybackSystem();
  system.start();
}

module.exports = BuybackSystem;