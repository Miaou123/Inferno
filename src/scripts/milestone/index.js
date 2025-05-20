/**
 * Milestone Burn Script for $INFERNO token
 * Monitors market cap and executes burns at predefined milestones
 */
const cron = require('node-cron');
const { BURN_SCHEDULE, getPendingMilestones } = require('./burnConfig');
const { priceEvents, getMarketCap } = require('../utils/priceOracle');
const { getReserveWalletKeypair, getTokenBalance } = require('../utils/solana');
const logger = require('../utils/logger').milestone;
const fileStorage = require('../utils/fileStorage');
const { Connection, PublicKey } = require('@solana/web3.js');
const fs = require('fs');
const path = require('path');
const { burn, getOrCreateAssociatedTokenAccount, getMint } = require('@solana/spl-token');
require('dotenv').config();

// Token decimals from environment or default to 6 (most common)
const TOKEN_DECIMALS = parseInt(process.env.TOKEN_DECIMALS || "6");

/**
 * Burn tokens using SPL Token burn function
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
  burnType = 'milestone'
) => {
  try {
    const connection = new Connection(process.env.SOLANA_RPC_URL, {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 60000 // 60 seconds
    });
    
    const burnAddress = process.env.BURN_ADDRESS || "1nc1nerator11111111111111111111111111111111";
    const tokenMint = new PublicKey(tokenAddress);
    
    // Get token decimals
    let tokenDecimals = TOKEN_DECIMALS;
    try {
      const mintInfo = await getMint(connection, tokenMint);
      tokenDecimals = mintInfo.decimals;
    } catch (error) {
      logger.warn(`Using default token decimals (${TOKEN_DECIMALS}): ${error.message}`);
    }
    
    // Get token account
    let userTokenAccount;
    try {
      userTokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        senderKeypair,
        tokenMint,
        senderKeypair.publicKey
      );
    } catch (error) {
      return { success: false, error: 'TOKEN_ACCOUNT_ERROR', details: error.message };
    }
    
    // Check balance
    if (userTokenAccount.amount < amount) {
      return {
        success: false,
        error: 'INSUFFICIENT_TOKENS',
        details: { required: amount, available: userTokenAccount.amount.toString() }
      };
    }
    
    // Convert to raw amount with decimals
    const rawAmount = amount * Math.pow(10, tokenDecimals);
    
    try {
      // Execute burn
      const signature = await burn(
        connection,
        senderKeypair,
        userTokenAccount.address,
        tokenMint,
        senderKeypair,
        rawAmount
      );
      
      logger.info(`Successfully burned ${amount.toLocaleString()} tokens (${burnType}): ${signature}`);
      
      return {
        success: true,
        signature,
        amount,
        rawAmount,
        decimals: tokenDecimals,
        sender: senderKeypair.publicKey.toString(),
        burnAddress
      };
    } catch (txError) {
      logger.error(`Burn transaction failed: ${txError.message}`);
      
      // Error categorization
      let errorType = 'UNKNOWN';
      const errorMessage = txError.message || '';
      
      if (errorMessage.includes('insufficient funds')) errorType = 'INSUFFICIENT_FUNDS';
      else if (errorMessage.includes('rate limit') || errorMessage.includes('429')) errorType = 'RATE_LIMIT';
      else if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) errorType = 'TIMEOUT';
      else if (errorMessage.includes('blockhash not found')) errorType = 'BLOCKHASH_EXPIRED';
      else if (errorMessage.includes('network error')) errorType = 'NETWORK_ERROR';
      
      return { success: false, error: errorType, details: errorMessage };
    }
  } catch (error) {
    logger.error(`Error in burn process: ${error.message}`);
    return { success: false, error: 'PROCESSING_ERROR', details: error.message };
  }
};

/**
 * Initialize storage data
 */
const initializeStorage = async () => {
  try {
    // Initialize storage files
    fileStorage.initializeStorage();
    
    // Check if milestones exist in storage
    const storedMilestones = fileStorage.readData(fileStorage.FILES.milestones);
    
    // Initialize milestones if none exist
    if (storedMilestones.length === 0) {
      logger.info('Initializing milestones from burn schedule configuration');
      
      BURN_SCHEDULE.forEach(milestone => {
        fileStorage.saveRecord('milestones', {
          id: `milestone-${milestone.marketCap}`,
          marketCap: milestone.marketCap,
          burnAmount: milestone.burnAmount,
          percentOfSupply: milestone.percentOfSupply,
          completed: false,
          createdAt: new Date().toISOString()
        });
      });
    }
    
    // Check if initial metrics exist
    const metrics = fileStorage.findRecords('metrics');
    
    if (metrics.length === 0) {
      // Create initial metrics record
      const initialSupply = Number(process.env.INITIAL_SUPPLY) || 1000000000;
      let reserveWalletBalance = 0;
      let reservePercentage = 0.3; // Default 30%
      
      // Try to get actual reserve wallet balance
      try {
        const walletAddress = process.env.SOLANA_PUBLIC_KEY;
        const tokenAddress = process.env.TOKEN_ADDRESS;
        
        if (walletAddress && tokenAddress) {
          reserveWalletBalance = await getTokenBalance(walletAddress, tokenAddress);
          reservePercentage = reserveWalletBalance / initialSupply;
          logger.info(`Using actual reserve balance: ${reserveWalletBalance.toLocaleString()} tokens (${(reservePercentage * 100).toFixed(2)}%)`);
        }
      } catch (err) {
        logger.warn(`Using default 30% reserve estimate: ${err.message}`);
        reserveWalletBalance = initialSupply * reservePercentage;
      }
      
      // Save initial metrics
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
    }
  } catch (error) {
    logger.error(`Storage initialization error: ${error.message}`);
    throw error;
  }
};

/**
 * Check for milestones that have been reached but not executed
 */
const checkMilestones = async (providedMarketCap = null) => {
  try {
    // Get current market cap (or use provided one)
    const currentMarketCap = providedMarketCap || await getMarketCap();
    logger.info(`Checking milestones with market cap: $${currentMarketCap.toLocaleString()}`);
    
    // Get all milestones from storage
    const milestones = fileStorage.readData(fileStorage.FILES.milestones);
    
    // Find incomplete milestones that have been reached
    const incompleteMilestones = milestones
      .filter(m => !m.completed && currentMarketCap >= m.marketCap)
      .sort((a, b) => a.marketCap - b.marketCap);
    
    if (incompleteMilestones.length === 0) {
      return;
    }
    
    logger.info(`Found ${incompleteMilestones.length} pending milestone(s) to execute`);
    
    // Process each milestone in sequence
    for (const milestone of incompleteMilestones) {
      await executeMilestoneBurn(milestone, currentMarketCap);
    }
  } catch (error) {
    logger.error(`Error checking milestones: ${error.message}`);
  }
};

/**
 * Execute a milestone burn
 * @param {Object} milestone - Milestone object from storage
 * @param {Number} currentMarketCap - Current market cap in USD
 */
const executeMilestoneBurn = async (milestone, currentMarketCap) => {
  logger.info(`Executing milestone burn for $${milestone.marketCap.toLocaleString()}: ${milestone.burnAmount.toLocaleString()} tokens (${milestone.percentOfSupply}% of supply)`);
  
  try {
    // Get reserve wallet keypair
    const reserveKeypair = getReserveWalletKeypair();
    
    // Execute with retry mechanism
    const maxRetries = 3;
    let retryCount = 0;
    let burnResult = null;
    
    while (retryCount < maxRetries) {
      burnResult = await burnTokens(
        reserveKeypair,
        milestone.burnAmount,
        process.env.TOKEN_ADDRESS,
        'milestone'
      );
      
      if (burnResult.success) {
        break; // Success
      } else if (burnResult.error === 'RATE_LIMIT' && retryCount < maxRetries - 1) {
        // Exponential backoff
        const backoffMs = Math.pow(2, retryCount) * 1000;
        logger.warn(`Rate limit error, retrying in ${backoffMs}ms (attempt ${retryCount + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        retryCount++;
      } else {
        // Non-recoverable error
        logger.error(`Failed to execute milestone burn: ${burnResult.error}`);
        return;
      }
    }
    
    if (!burnResult || !burnResult.success) {
      logger.error('Failed to execute milestone burn after maximum retries');
      return;
    }
    
    // Get transaction details
    let txDetails;
    try {
      const connection = new Connection(process.env.SOLANA_RPC_URL);
      txDetails = await connection.getTransaction(burnResult.signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0
      });
    } catch (txError) {
      // Continue even if we can't get details
    }
    
    // Record the burn
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
  } catch (error) {
    logger.error(`Error executing milestone burn: ${error.message}`);
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
    
    if (!latestMetrics) {
      // Create metrics from scratch if none exist
      const initialSupply = Number(process.env.INITIAL_SUPPLY) || 1000000000;
      fileStorage.saveRecord('metrics', {
        timestamp: new Date().toISOString(),
        totalSupply: initialSupply - burnAmount,
        circulatingSupply: initialSupply - burnAmount - (initialSupply * 0.3 - burnAmount),
        reserveWalletBalance: initialSupply * 0.3 - burnAmount,
        totalBurned: burnAmount,
        buybackBurned: 0,
        milestoneBurned: burnAmount
      });
      return;
    }
    
    // Create new metrics entry with updated values
    fileStorage.saveRecord('metrics', {
      timestamp: new Date().toISOString(),
      totalSupply: latestMetrics.totalSupply - burnAmount,
      circulatingSupply: latestMetrics.circulatingSupply,
      reserveWalletBalance: latestMetrics.reserveWalletBalance - burnAmount,
      totalBurned: latestMetrics.totalBurned + burnAmount,
      buybackBurned: latestMetrics.buybackBurned || 0,
      milestoneBurned: (latestMetrics.milestoneBurned || 0) + burnAmount,
      priceInSol: latestMetrics.priceInSol,
      priceInUsd: latestMetrics.priceInUsd,
      marketCap: latestMetrics.marketCap
    });
  } catch (error) {
    logger.error(`Error updating metrics: ${error.message}`);
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

  // Vérifier périodiquement le fichier de prix (toutes les 10 secondes)
  setInterval(async () => {
    try {
      const priceFile = path.join(__dirname, '../../../data/latest-price.json');
      if (!fs.existsSync(priceFile)) return;
      
      const stats = fs.statSync(priceFile);
      const lastModified = new Date(stats.mtime);
      const now = new Date();
      
      // Si le fichier a été modifié dans les 30 dernières secondes
      if ((now - lastModified) < 30000) {
        const priceDataText = fs.readFileSync(priceFile, 'utf8');
        const priceData = JSON.parse(priceDataText);
        
        logger.info(`Price update detected via file with market cap: $${priceData.marketCap.toLocaleString()}`);
        await checkMilestones(priceData.marketCap);
      }
    } catch (error) {
      logger.error(`Error reading price file: ${error.message}`);
    }
  }, 10000);

    // Optional: Keep a fallback check every hour
    cron.schedule('0 * * * *', async () => {
      logger.info('Running fallback milestone check');
      await checkMilestones();
    });
    
    logger.info('Milestone monitoring started successfully');
  } catch (error) {
    logger.error(`Failed to start milestone monitoring: ${error.message}`);
    process.exit(1);
  }
};

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('Shutting down gracefully');
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
  burnTokens
};