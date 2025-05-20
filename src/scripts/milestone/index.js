/**
 * Milestone Burn Script for $INFERNO token
 * Monitors market cap and executes burns at predefined milestones
 * Uses the improved burnTokens system from buyback system
 */
const cron = require('node-cron');
const { 
  BURN_SCHEDULE,
  getNextMilestone,
  getPendingMilestones 
} = require('./burnConfig');
const { getMarketCap } = require('../utils/priceOracle');
const { getReserveWalletKeypair } = require('../utils/solana');
const logger = require('../utils/logger').milestone;
const fileStorage = require('../utils/fileStorage');
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const { burn, getOrCreateAssociatedTokenAccount, getMint } = require('@solana/spl-token');
require('dotenv').config();

// Token decimals from environment or default to 6 (most common)
const TOKEN_DECIMALS = parseInt(process.env.TOKEN_DECIMALS || "6");

/**
 * Burn tokens using SPL Token burn function with proper decimal handling
 * 
 * @param {Keypair} senderKeypair - Keypair of the sender
 * @param {Number} amount - Amount of tokens to burn (human-readable)
 * @param {String} tokenAddress - Token mint address
 * @param {String} burnType - Type of burn ('milestone' or 'buyback')
 * @returns {Promise<Object>} Transaction result
 */
const burnTokens = async (
  senderKeypair,
  amount,
  tokenAddress = process.env.TOKEN_ADDRESS,
  burnType = 'general'
) => {
  try {
    const connection = new Connection(process.env.SOLANA_RPC_URL, {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 60000 // 60 seconds
    });
    
    // Use burn address from environment or fall back to standard address
    const burnAddress = process.env.BURN_ADDRESS || "1nc1nerator11111111111111111111111111111111";
    
    // Convert tokenAddress to PublicKey
    const tokenMint = new PublicKey(tokenAddress);
    
    // Check wallet balance before proceeding
    logger.info(`Checking wallet balance for ${burnType} burn`);
    
    // Get the mint info to determine decimals
    let tokenDecimals = TOKEN_DECIMALS;
    try {
      const mintInfo = await getMint(connection, tokenMint);
      tokenDecimals = mintInfo.decimals;
      logger.info(`Detected token decimals: ${tokenDecimals}`);
    } catch (error) {
      logger.warn(`Could not detect token decimals, using default: ${TOKEN_DECIMALS}. Error: ${error.message}`);
    }
    
    // Get the sender's token account
    let userTokenAccount;
    try {
      userTokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        senderKeypair,
        tokenMint,
        senderKeypair.publicKey
      );
      
      logger.info(`Found token account: ${userTokenAccount.address.toString()}`);
    } catch (error) {
      logger.error(`Error getting token account: ${error.message}`);
      return {
        success: false,
        error: 'TOKEN_ACCOUNT_ERROR',
        details: error.message
      };
    }
    
    // Safety check: Verify there are sufficient tokens in the wallet
    if (userTokenAccount.amount < amount) {
      logger.error(`Insufficient tokens in ${burnType} wallet. Required: ${amount.toLocaleString()}, Available: ${userTokenAccount.amount}`);
      return {
        success: false,
        error: 'INSUFFICIENT_TOKENS',
        details: {
          required: amount,
          available: userTokenAccount.amount.toString(),
          walletType: burnType
        }
      };
    }
    
    logger.info(`Sufficient tokens available in ${burnType} wallet. Required: ${amount.toLocaleString()}, Available: ${userTokenAccount.amount}`);
    
    // Convert amount to raw amount with decimals
    const rawAmount = amount * Math.pow(10, tokenDecimals);
    logger.info(`Converting ${amount.toLocaleString()} tokens to ${rawAmount.toLocaleString()} raw units (${tokenDecimals} decimals)`);
    
    try {
      // Execute the burn transaction using the SPL Token burn function
      logger.info(`Burning ${amount.toLocaleString()} tokens from account ${userTokenAccount.address.toString()}`);
      
      const signature = await burn(
        connection,
        senderKeypair,              // payer
        userTokenAccount.address,   // account
        tokenMint,                  // mint
        senderKeypair,              // owner
        rawAmount                   // amount with decimals
      );
      
      logger.info(`Burned ${amount.toLocaleString()} tokens successfully! Signature: ${signature}`);
      
      // Return success result in the format expected by the existing system
      return {
        success: true,
        signature,
        amount,
        rawAmount,
        decimals: tokenDecimals,
        sender: senderKeypair.publicKey.toString(),
        burnAddress,
        memo: `$INFERNO ${burnType.toUpperCase()} BURN: ${amount.toLocaleString()} tokens`
      };
    } catch (txError) {
      // Handle transaction errors with the same error categorization as before
      logger.error(`Transaction failed: ${txError.message}`);
      
      let errorType = 'UNKNOWN';
      const errorMessage = txError.message || '';
      
      if (errorMessage.includes('insufficient funds')) {
        errorType = 'INSUFFICIENT_FUNDS';
      } else if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
        errorType = 'RATE_LIMIT';
      } else if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
        errorType = 'TIMEOUT';
      } else if (errorMessage.includes('blockhash not found') || errorMessage.includes('old blockhash')) {
        errorType = 'BLOCKHASH_EXPIRED';
      } else if (errorMessage.includes('network error') || errorMessage.includes('connection error')) {
        errorType = 'NETWORK_ERROR';
      }
      
      return {
        success: false,
        error: errorType,
        details: errorMessage
      };
    }
  } catch (error) {
    logger.error('Error in burn process:', error);
    return {
      success: false,
      error: 'PROCESSING_ERROR',
      details: error.message
    };
  }
};

// Helper function to get token balance
const getTokenBalance = async (walletAddress, tokenAddress) => {
  try {
    const connection = new Connection(process.env.SOLANA_RPC_URL, {
      commitment: 'confirmed'
    });
    
    const wallet = new PublicKey(walletAddress);
    const token = new PublicKey(tokenAddress);
    
    // Get all token accounts owned by the wallet for this specific token
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      wallet,
      { mint: token }
    );
    
    // If no accounts found, return 0
    if (tokenAccounts.value.length === 0) {
      return 0;
    }
    
    // Sum the balance of all accounts (normally there's just one)
    let totalBalance = 0;
    for (const account of tokenAccounts.value) {
      const parsedInfo = account.account.data.parsed.info;
      totalBalance += parsedInfo.tokenAmount.uiAmount;
    }
    
    return totalBalance;
  } catch (error) {
    logger.error('Error getting token balance:', error);
    throw new Error(`Failed to get token balance: ${error.message}`);
  }
};

// Initialize storage on startup
const initializeStorage = async () => {
  try {
    // Initialize storage files
    fileStorage.initializeStorage();
    
    // Check if initial metrics exist
    const metrics = fileStorage.findRecords('metrics');
    
    if (metrics.length === 0) {
      // Create initial metrics record with actual reserve balance
      const initialSupply = Number(process.env.INITIAL_SUPPLY) || 1000000000;
      
      // Try to get actual reserve wallet balance
      try {
        // Get wallet address from env (same wallet used for creation)
        const walletAddress = process.env.SOLANA_PUBLIC_KEY;
        const tokenAddress = process.env.TOKEN_ADDRESS;
        
        // Only try to get balance if we have both addresses
        if (walletAddress && tokenAddress) {
          const reserveWalletBalance = await getTokenBalance(walletAddress, tokenAddress);
          const reservePercentage = reserveWalletBalance / initialSupply;
          
          logger.info(`Using actual reserve balance: ${reserveWalletBalance.toLocaleString()} tokens (${(reservePercentage * 100).toFixed(2)}% of supply)`);
          
          fileStorage.saveRecord('metrics', {
            timestamp: new Date().toISOString(),
            totalSupply: initialSupply,
            circulatingSupply: initialSupply - reserveWalletBalance,
            reserveWalletBalance,
            reservePercentage,
            totalBurned: 0,
            buybackBurned: 0,
            milestoneBurned: 0,
            marketCap: 0
          });
        } else {
          // Fallback if addresses aren't available
          throw new Error('Missing wallet or token address');
        }
      } catch (err) {
        // Fallback to default 30% if we can't get actual balance
        logger.warn(`Couldn't get actual reserve balance: ${err.message}. Using default 30% estimate.`);
        const reservePercentage = 0.3; // 30% as fallback
        
        fileStorage.saveRecord('metrics', {
          timestamp: new Date().toISOString(),
          totalSupply: initialSupply,
          circulatingSupply: initialSupply * (1 - reservePercentage),
          reserveWalletBalance: initialSupply * reservePercentage,
          reservePercentage,
          totalBurned: 0,
          buybackBurned: 0,
          milestoneBurned: 0,
          marketCap: 0
        });
      }
      
      logger.info('Initialized metrics in storage');
    }
    
    logger.info('Storage initialization complete');
  } catch (error) {
    logger.error('Error initializing storage:', error);
    throw error;
  }
};

/**
 * Check if any milestones have been reached but not executed
 */
const checkMilestones = async () => {
  try {
    logger.info('Checking for pending milestones');
    
    // Get current market cap
    const currentMarketCap = await getMarketCap();
    logger.info(`Current market cap: $${currentMarketCap.toLocaleString()}`);
    
    // Get incomplete milestones from storage
    const milestones = fileStorage.readData(fileStorage.FILES.milestones);
    const incompleteMilestones = milestones
      .filter(m => !m.completed && currentMarketCap >= m.marketCap)
      .sort((a, b) => a.marketCap - b.marketCap);
    
    if (incompleteMilestones.length === 0) {
      logger.info('No pending milestones found');
      return;
    }
    
    logger.info(`Found ${incompleteMilestones.length} pending milestones to execute`);
    
    // Process each milestone in sequence
    for (const milestone of incompleteMilestones) {
      await executeMilestoneBurn(milestone, currentMarketCap);
    }
  } catch (error) {
    logger.error('Error checking milestones:', error);
  }
};

/**
 * Execute a milestone burn
 * @param {Object} milestone - Milestone object from storage
 * @param {Number} currentMarketCap - Current market cap in USD
 */
const executeMilestoneBurn = async (milestone, currentMarketCap) => {
  logger.info(`Executing milestone burn for $${milestone.marketCap.toLocaleString()} market cap`);
  logger.info(`Burn amount: ${milestone.burnAmount.toLocaleString()} tokens (${milestone.percentOfSupply}% of supply)`);
  
  try {
    // Get reserve wallet keypair
    const reserveKeypair = getReserveWalletKeypair();
    
    // Execute the burn transaction with retry mechanism
    const maxRetries = 3;
    let retryCount = 0;
    let burnResult;
    
    while (retryCount < maxRetries) {
      try {
        // Execute the burn transaction with proper decimal handling
        burnResult = await burnTokens(
          reserveKeypair,
          milestone.burnAmount,
          process.env.TOKEN_ADDRESS,
          'milestone'
        );
        
        if (burnResult.success) {
          break; // Success, exit retry loop
        } else {
          // Check if this is a recoverable error (rate limit, etc.)
          const isRateLimitError = burnResult.error && 
            (burnResult.error.includes('429') || 
             burnResult.error === 'RATE_LIMIT' ||
             burnResult.error.includes('too many requests'));
             
          if (isRateLimitError && retryCount < maxRetries - 1) {
            // Exponential backoff
            const backoffMs = Math.pow(2, retryCount) * 1000;
            logger.warn(`Rate limit reached, retrying in ${backoffMs}ms (attempt ${retryCount + 1}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, backoffMs));
            retryCount++;
          } else {
            // Non-recoverable error or max retries reached
            logger.error(`Failed to execute milestone burn: ${burnResult.error}`);
            return;
          }
        }
      } catch (err) {
        // Handle unexpected errors in the burn function
        logger.error(`Unexpected error during burn (attempt ${retryCount + 1}/${maxRetries}):`, err);
        
        if (retryCount < maxRetries - 1) {
          const backoffMs = Math.pow(2, retryCount) * 1000;
          await new Promise(resolve => setTimeout(resolve, backoffMs));
          retryCount++;
        } else {
          throw err; // Re-throw if max retries reached
        }
      }
    }
    
    if (!burnResult || !burnResult.success) {
      logger.error('Failed to execute milestone burn after maximum retries');
      return;
    }
    
    logger.info(`Burn successful with transaction signature: ${burnResult.signature}`);
    
    // Get transaction confirmation and details
    let txDetails;
    try {
      const connection = new Connection(process.env.SOLANA_RPC_URL);
      txDetails = await connection.getTransaction(burnResult.signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0
      });
      logger.info('Retrieved transaction details');
    } catch (txError) {
      logger.warn(`Could not retrieve transaction details: ${txError.message}`);
      // Continue even if we can't get details
    }
    
    // Create burn record in storage with enhanced data if available
    const burnRecord = {
      burnType: 'milestone',
      burnAmount: milestone.burnAmount,
      txSignature: burnResult.signature,
      initiator: 'milestone-script',
      marketCapAtBurn: currentMarketCap,
      milestone: milestone.marketCap,
      timestamp: new Date().toISOString(),
      details: {
        milestoneName: `$${milestone.marketCap.toLocaleString()} Market Cap`,
        percentOfSupply: milestone.percentOfSupply,
        blockTime: txDetails?.blockTime ? new Date(txDetails.blockTime * 1000).toISOString() : null,
        fee: txDetails?.meta?.fee || null,
        slot: txDetails?.slot || null,
        decimals: burnResult.decimals || TOKEN_DECIMALS,
        rawAmount: burnResult.rawAmount
      }
    };
    
    fileStorage.saveRecord('burns', burnRecord);
    
    // Update milestone as completed
    const milestones = fileStorage.readData(fileStorage.FILES.milestones);
    const updatedMilestones = milestones.map(m => {
      if (m.id === milestone.id) {
        return {
          ...m,
          completed: true,
          txSignature: burnResult.signature,
          completedAt: new Date().toISOString(),
          burnId: burnRecord.id
        };
      }
      return m;
    });
    
    fileStorage.writeData(fileStorage.FILES.milestones, updatedMilestones);
    
    // Update metrics
    await updateMetrics(milestone.burnAmount);
    
    logger.info(`Milestone burn for $${milestone.marketCap.toLocaleString()} completed successfully`);
    
    // Log burn details
    logBurnDetails(milestone, burnResult.signature);
  } catch (error) {
    logger.error(`Error executing milestone burn: ${error}`);
  }
};

/**
 * Update token metrics after a burn
 * @param {Number} burnAmount - Amount of tokens burned
 */
const updateMetrics = async (burnAmount) => {
  try {
    // Get current metrics
    const metrics = fileStorage.findRecords('metrics', () => true, { 
      sort: { field: 'timestamp', order: 'desc' }, 
      limit: 1 
    });
    
    const latestMetrics = metrics[0];
    
    // If no metrics exist, create a new baseline
    if (!latestMetrics) {
      const initialSupply = Number(process.env.INITIAL_SUPPLY) || 1000000000;
      const newMetrics = {
        timestamp: new Date().toISOString(),
        totalSupply: initialSupply - burnAmount,
        circulatingSupply: initialSupply - burnAmount - (initialSupply * 0.3 - burnAmount), // Adjust based on reserve wallet
        reserveWalletBalance: initialSupply * 0.3 - burnAmount,
        totalBurned: burnAmount,
        buybackBurned: 0,
        milestoneBurned: burnAmount
      };
      
      fileStorage.saveRecord('metrics', newMetrics);
      return;
    }
    
    // Create new metrics entry
    const newMetrics = {
      timestamp: new Date().toISOString(),
      totalSupply: latestMetrics.totalSupply - burnAmount,
      circulatingSupply: latestMetrics.circulatingSupply,
      reserveWalletBalance: latestMetrics.reserveWalletBalance - burnAmount,
      totalBurned: latestMetrics.totalBurned + burnAmount,
      buybackBurned: latestMetrics.buybackBurned,
      milestoneBurned: latestMetrics.milestoneBurned + burnAmount,
      priceInSol: latestMetrics.priceInSol,
      priceInUsd: latestMetrics.priceInUsd,
      marketCap: latestMetrics.marketCap
    };
    
    fileStorage.saveRecord('metrics', newMetrics);
    logger.info('Metrics updated successfully');
  } catch (error) {
    logger.error(`Error updating metrics: ${error}`);
  }
};

/**
 * Log milestone burn information
 * @param {Object} milestone - Milestone object
 * @param {String} txSignature - Transaction signature
 */
const logBurnDetails = (milestone, txSignature) => {
  try {
    const message = `🔥 $INFERNO MILESTONE BURN EXECUTED 🔥\n\nMilestone: $${milestone.marketCap.toLocaleString()} Market Cap\nBurned: ${milestone.burnAmount.toLocaleString()} tokens (${milestone.percentOfSupply}% of supply)\nTransaction: https://solscan.io/tx/${txSignature}`;
    
    logger.info(message);
  } catch (error) {
    logger.error(`Error logging burn details: ${error}`);
  }
};

/**
 * Start the milestone monitoring process
 */
const startMilestoneMonitoring = async () => {
  try {
    // Initialize storage
    await initializeStorage();
    
    // Run initial check
    await checkMilestones();
    
    // Schedule regular checks (every 5 minutes)
    cron.schedule('*/1 * * * *', async () => {
      logger.info('Running scheduled milestone check');
      await checkMilestones();
    });
    
    logger.info('Milestone monitoring started successfully');
  } catch (error) {
    logger.error(`Error starting milestone monitoring: ${error}`);
    process.exit(1);
  }
};

// Handle graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully');
  process.exit(0);
});

// Start the script if it's run directly
if (require.main === module) {
  startMilestoneMonitoring();
}

// Export functions for testing and importing
module.exports = {
  checkMilestones,
  executeMilestoneBurn,
  updateMetrics,
  startMilestoneMonitoring,
  burnTokens  // Export the burnTokens function to make it available for testing
};