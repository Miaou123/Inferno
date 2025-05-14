/**
 * Recovery Mechanism for $INFERNO token burn operations
 * 
 * This module provides tools to:
 * 1. Recover from failed milestone burns
 * 2. Retry failed transactions
 * 3. Verify and reconcile token balances
 */
const { 
  getTokenBalance, 
  getConnection, 
  getReserveWalletKeypair, 
  burnTokens 
} = require('./solana');
const { getMarketCap } = require('./priceOracle');
const fileStorage = require('./fileStorage');
const logger = require('./logger').recovery;
const { PublicKey } = require('@solana/web3.js');

/**
 * Check for failed milestone burns and attempt recovery
 * @returns {Promise<Object>} Recovery results
 */
const recoverFailedMilestoneBurns = async () => {
  logger.info('Checking for failed milestone burns to recover');
  
  // Get all milestones
  const milestones = fileStorage.readData(fileStorage.FILES.milestones);
  const failedMilestones = milestones.filter(milestone => 
    milestone.status === 'failed' || 
    (milestone.attempted && !milestone.completed)
  );
  
  if (failedMilestones.length === 0) {
    logger.info('No failed milestone burns found to recover');
    return { recovered: 0, failures: 0, details: [] };
  }
  
  logger.info(`Found ${failedMilestones.length} failed milestone burns to recover`);
  
  // Get current market cap to verify milestone eligibility
  const currentMarketCap = await getMarketCap();
  
  const results = {
    recovered: 0,
    failures: 0,
    details: []
  };
  
  // Process each failed milestone
  for (const milestone of failedMilestones) {
    // Skip milestones that haven't been reached yet
    if (milestone.marketCap > currentMarketCap) {
      logger.info(`Skipping recovery for milestone ${milestone.marketCap} as current market cap (${currentMarketCap}) is lower`);
      continue;
    }
    
    logger.info(`Attempting to recover failed burn for milestone ${milestone.marketCap}`);
    
    // Get reserve wallet keypair
    const reserveKeypair = getReserveWalletKeypair();
    
    // Attempt the burn again
    const burnResult = await burnTokens(
      reserveKeypair,
      milestone.burnAmount,
      process.env.TOKEN_ADDRESS,
      'milestone-recovery'
    );
    
    if (burnResult.success) {
      // Update milestone status
      const updatedMilestones = milestones.map(m => {
        if (m.id === milestone.id) {
          return {
            ...m,
            completed: true,
            status: 'recovered',
            recoveryTxSignature: burnResult.signature,
            recoveredAt: new Date().toISOString()
          };
        }
        return m;
      });
      
      fileStorage.writeData(fileStorage.FILES.milestones, updatedMilestones);
      
      // Create burn record
      const burnRecord = {
        burnType: 'milestone-recovery',
        amount: milestone.burnAmount,
        txSignature: burnResult.signature,
        initiator: 'recovery-script',
        marketCapAtBurn: currentMarketCap,
        milestone: milestone.marketCap,
        timestamp: new Date().toISOString(),
        details: {
          recoveredMilestone: milestone.id,
          originalFailureReason: milestone.failureReason || 'unknown'
        }
      };
      
      fileStorage.saveRecord('burns', burnRecord);
      
      // Update metrics
      await updateMetricsAfterRecovery(milestone.burnAmount);
      
      logger.info(`Successfully recovered milestone burn for ${milestone.marketCap}`);
      
      results.recovered++;
      results.details.push({
        milestone: milestone.marketCap,
        status: 'recovered',
        txSignature: burnResult.signature
      });
    } else {
      logger.error(`Failed to recover milestone burn for ${milestone.marketCap}: ${burnResult.error}`);
      
      // Update milestone with new attempt information
      const updatedMilestones = milestones.map(m => {
        if (m.id === milestone.id) {
          return {
            ...m,
            recoveryAttempted: true,
            lastRecoveryAttempt: new Date().toISOString(),
            failureReason: burnResult.error,
            failureDetails: burnResult.details
          };
        }
        return m;
      });
      
      fileStorage.writeData(fileStorage.FILES.milestones, updatedMilestones);
      
      results.failures++;
      results.details.push({
        milestone: milestone.marketCap,
        status: 'failed',
        error: burnResult.error
      });
    }
  }
  
  logger.info(`Recovery process completed. Recovered: ${results.recovered}, Failed: ${results.failures}`);
  return results;
};

/**
 * Update metrics after a recovery burn
 * @param {Number} burnAmount - Amount of tokens burned in recovery
 */
const updateMetricsAfterRecovery = async (burnAmount) => {
  try {
    // Get current metrics
    const metrics = fileStorage.findRecords('metrics', () => true, { 
      sort: { field: 'timestamp', order: 'desc' }, 
      limit: 1 
    });
    
    const latestMetrics = metrics[0];
    
    // Create new metrics entry
    const newMetrics = {
      timestamp: new Date().toISOString(),
      totalSupply: latestMetrics.totalSupply - burnAmount,
      circulatingSupply: latestMetrics.circulatingSupply,
      reserveWalletBalance: latestMetrics.reserveWalletBalance - burnAmount,
      totalBurned: latestMetrics.totalBurned + burnAmount,
      buybackBurned: latestMetrics.buybackBurned,
      milestoneBurned: latestMetrics.milestoneBurned + burnAmount,
      recoveryBurned: (latestMetrics.recoveryBurned || 0) + burnAmount,
      priceInSol: latestMetrics.priceInSol,
      priceInUsd: latestMetrics.priceInUsd,
      marketCap: latestMetrics.marketCap
    };
    
    fileStorage.saveRecord('metrics', newMetrics);
    logger.info('Metrics updated after recovery burn');
  } catch (error) {
    logger.error(`Error updating metrics after recovery: ${error}`);
  }
};

/**
 * Verify reserve wallet balance matches expected amount from metrics
 * @returns {Promise<Object>} Verification results
 */
const verifyReserveBalance = async () => {
  try {
    logger.info('Verifying reserve wallet balance');
    
    // Get current metrics
    const metrics = fileStorage.findRecords('metrics', () => true, { 
      sort: { field: 'timestamp', order: 'desc' }, 
      limit: 1 
    });
    
    const latestMetrics = metrics[0];
    
    if (!latestMetrics) {
      logger.error('No metrics found, cannot verify reserve balance');
      return {
        success: false,
        error: 'NO_METRICS_FOUND'
      };
    }
    
    // Get reserve wallet keypair
    const reserveKeypair = getReserveWalletKeypair();
    
    // Get actual balance
    const actualBalance = await getTokenBalance(
      reserveKeypair.publicKey.toString(), 
      process.env.TOKEN_ADDRESS
    );
    
    // Compare with expected balance
    const expectedBalance = latestMetrics.reserveWalletBalance;
    const discrepancy = actualBalance - expectedBalance;
    
    logger.info(`Reserve wallet balance - Expected: ${expectedBalance.toLocaleString()}, Actual: ${actualBalance.toLocaleString()}, Discrepancy: ${discrepancy.toLocaleString()}`);
    
    // Update metrics if there's a discrepancy
    if (Math.abs(discrepancy) > 0) {
      logger.warn(`Found discrepancy in reserve wallet balance: ${discrepancy.toLocaleString()} tokens`);
      
      // Create new metrics with corrected balance
      const newMetrics = {
        ...latestMetrics,
        timestamp: new Date().toISOString(),
        reserveWalletBalance: actualBalance,
        balanceCorrected: true,
        previousBalance: expectedBalance,
        discrepancy
      };
      
      fileStorage.saveRecord('metrics', newMetrics);
      logger.info('Updated metrics with corrected reserve wallet balance');
    }
    
    return {
      success: true,
      expectedBalance,
      actualBalance,
      discrepancy,
      correctionNeeded: Math.abs(discrepancy) > 0
    };
  } catch (error) {
    logger.error(`Error verifying reserve balance: ${error}`);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Check for failed buyback burns and attempt recovery
 * @returns {Promise<Object>} Recovery results
 */
const recoverFailedBuybackBurns = async () => {
  logger.info('Checking for failed buyback burns to recover');
  
  // Get all rewards records
  const rewards = fileStorage.readData(fileStorage.FILES.rewards);
  const failedBuybacks = rewards.filter(reward => 
    reward.status === 'failed' && 
    reward.tokensBought && 
    !reward.tokensBurned
  );
  
  if (failedBuybacks.length === 0) {
    logger.info('No failed buyback burns found to recover');
    return { recovered: 0, failures: 0, details: [] };
  }
  
  logger.info(`Found ${failedBuybacks.length} failed buyback burns to recover`);
  
  const results = {
    recovered: 0,
    failures: 0,
    details: []
  };
  
  // Process each failed buyback
  for (const reward of failedBuybacks) {
    logger.info(`Attempting to recover failed buyback burn for reward ID ${reward.id}`);
    
    // Get wallet keypair (using main wallet for buybacks)
    const keypair = createKeypair();
    
    // Attempt the burn
    const burnResult = await burnTokens(
      keypair,
      reward.tokensBought,
      process.env.TOKEN_ADDRESS,
      'buyback-recovery'
    );
    
    if (burnResult.success) {
      // Update reward record
      const updatedRewards = rewards.map(r => {
        if (r.id === reward.id) {
          return {
            ...r,
            status: 'recovered',
            tokensBurned: reward.tokensBought,
            burnTxSignature: burnResult.signature,
            recoveredAt: new Date().toISOString()
          };
        }
        return r;
      });
      
      fileStorage.writeData(fileStorage.FILES.rewards, updatedRewards);
      
      // Create burn record
      const burnRecord = {
        burnType: 'buyback-recovery',
        amount: reward.tokensBought,
        txSignature: burnResult.signature,
        initiator: 'recovery-script',
        timestamp: new Date().toISOString(),
        details: {
          recoveredReward: reward.id,
          originalFailureReason: reward.errorMessage || 'unknown'
        }
      };
      
      fileStorage.saveRecord('burns', burnRecord);
      
      // Update metrics
      await updateBuybackMetricsAfterRecovery(reward.tokensBought);
      
      logger.info(`Successfully recovered buyback burn for reward ID ${reward.id}`);
      
      results.recovered++;
      results.details.push({
        rewardId: reward.id,
        status: 'recovered',
        txSignature: burnResult.signature
      });
    } else {
      logger.error(`Failed to recover buyback burn for reward ID ${reward.id}: ${burnResult.error}`);
      
      // Update reward with new attempt information
      const updatedRewards = rewards.map(r => {
        if (r.id === reward.id) {
          return {
            ...r,
            recoveryAttempted: true,
            lastRecoveryAttempt: new Date().toISOString(),
            errorMessage: burnResult.error,
            errorDetails: burnResult.details
          };
        }
        return r;
      });
      
      fileStorage.writeData(fileStorage.FILES.rewards, updatedRewards);
      
      results.failures++;
      results.details.push({
        rewardId: reward.id,
        status: 'failed',
        error: burnResult.error
      });
    }
  }
  
  logger.info(`Buyback recovery process completed. Recovered: ${results.recovered}, Failed: ${results.failures}`);
  return results;
};

/**
 * Update metrics after a buyback recovery burn
 * @param {Number} burnAmount - Amount of tokens burned in recovery
 */
const updateBuybackMetricsAfterRecovery = async (burnAmount) => {
  try {
    // Get current metrics
    const metrics = fileStorage.findRecords('metrics', () => true, { 
      sort: { field: 'timestamp', order: 'desc' }, 
      limit: 1 
    });
    
    const latestMetrics = metrics[0];
    
    // Create new metrics entry
    const newMetrics = {
      timestamp: new Date().toISOString(),
      totalSupply: latestMetrics.totalSupply - burnAmount,
      circulatingSupply: latestMetrics.circulatingSupply - burnAmount,
      reserveWalletBalance: latestMetrics.reserveWalletBalance,
      totalBurned: latestMetrics.totalBurned + burnAmount,
      buybackBurned: latestMetrics.buybackBurned + burnAmount,
      milestoneBurned: latestMetrics.milestoneBurned,
      recoveryBurned: (latestMetrics.recoveryBurned || 0) + burnAmount,
      priceInSol: latestMetrics.priceInSol,
      priceInUsd: latestMetrics.priceInUsd,
      marketCap: latestMetrics.marketCap
    };
    
    fileStorage.saveRecord('metrics', newMetrics);
    logger.info('Metrics updated after buyback recovery burn');
  } catch (error) {
    logger.error(`Error updating metrics after buyback recovery: ${error}`);
  }
};

/**
 * Run a full recovery process
 * @returns {Promise<Object>} Results of all recovery operations
 */
const runFullRecovery = async () => {
  logger.info('Starting full recovery process');
  
  const results = {
    verifyReserveBalance: null,
    recoverMilestoneBurns: null,
    recoverBuybackBurns: null
  };
  
  // Step 1: Verify reserve balance
  try {
    results.verifyReserveBalance = await verifyReserveBalance();
  } catch (error) {
    logger.error(`Error in reserve balance verification: ${error}`);
    results.verifyReserveBalance = { success: false, error: error.message };
  }
  
  // Step 2: Recover failed milestone burns
  try {
    results.recoverMilestoneBurns = await recoverFailedMilestoneBurns();
  } catch (error) {
    logger.error(`Error in milestone burn recovery: ${error}`);
    results.recoverMilestoneBurns = { success: false, error: error.message };
  }
  
  // Step 3: Recover failed buyback burns
  try {
    results.recoverBuybackBurns = await recoverFailedBuybackBurns();
  } catch (error) {
    logger.error(`Error in buyback burn recovery: ${error}`);
    results.recoverBuybackBurns = { success: false, error: error.message };
  }
  
  logger.info('Full recovery process completed');
  return results;
};

module.exports = {
  recoverFailedMilestoneBurns,
  recoverFailedBuybackBurns,
  verifyReserveBalance,
  runFullRecovery
};