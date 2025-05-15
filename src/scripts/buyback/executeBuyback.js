/**
 * Buyback execution utility for $INFERNO token
 * Part of the buyback system
 */
const logger = require('../utils/logger').buyback;
const fileStorage = require('../utils/fileStorage');
const { fetchTokenPrice } = require('../utils/priceOracle');
require('dotenv').config();

// Configuration from environment variables
const config = {
  maxSlippage: parseFloat(process.env.MAX_SLIPPAGE_PERCENT) || 2,
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
    
    // Get token price
    let tokenPriceInSol;
    let tokenPriceInUsd;
    
    try {
      const priceData = await fetchTokenPrice();
      tokenPriceInSol = priceData.tokenPriceInSol;
      tokenPriceInUsd = priceData.tokenPriceInUsd;
      logger.info(`Current token price: ${tokenPriceInSol} SOL (${tokenPriceInUsd} USD)`);
    } catch (priceError) {
      logger.warn(`Failed to fetch token price: ${priceError.message}. Using fallback values.`);
      // Fallback prices
      tokenPriceInSol = 0.00001; // 1 SOL = 100,000 tokens
      tokenPriceInUsd = 0.002;   // 1 token = $0.002
    }
    
    // Calculate amount of tokens to buy (accounting for slippage)
    const slippageBuffer = 1 - (config.maxSlippage / 100);
    const expectedTokenAmount = Math.floor((buybackSolAmount / tokenPriceInSol) * slippageBuffer);
    
    logger.info(`Expected token amount: ${expectedTokenAmount.toLocaleString()} at price ${tokenPriceInSol} SOL per token`);
    
    // In test mode, simulate a successful buyback
    if (config.testMode) {
      logger.info('TEST MODE: Simulating buyback transaction');
      
      // Simulate slight slippage
      const actualTokenAmount = Math.floor(expectedTokenAmount * 0.99);
      const txSignature = `simulated_buyback_tx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      
      // Update the reward record
      const rewards = fileStorage.readData(fileStorage.FILES.rewards);
      const updatedRewards = rewards.map(r => {
        if (r.id === rewardId) {
          return {
            ...r,
            tokensBought: actualTokenAmount,
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
      
      logger.info(`TEST MODE: Simulated buying ${actualTokenAmount.toLocaleString()} tokens with ${buybackSolAmount} SOL (tx: ${txSignature})`);
      
      // Return simulated result
      return {
        success: true,
        tokenAmount: actualTokenAmount,
        solAmount: buybackSolAmount,
        solAmountReserved: solAmount - buybackSolAmount,
        txSignature,
        testMode: true
      };
    }
    
    // TODO: Integrate with pump.fun's swap API to execute the actual buyback
    // For now, return a simulated success response
    logger.warn('MOCK IMPLEMENTATION: Actual swap API integration not implemented');
    
    // Simulate a successful buyback with slight slippage
    const actualTokenAmount = Math.floor(expectedTokenAmount * 0.99);
    const txSignature = `mock_buyback_tx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    // Update the reward record
    const rewards = fileStorage.readData(fileStorage.FILES.rewards);
    const updatedRewards = rewards.map(r => {
      if (r.id === rewardId) {
        return {
          ...r,
          tokensBought: actualTokenAmount,
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
    
    logger.info(`MOCK: Bought ${actualTokenAmount.toLocaleString()} tokens with ${buybackSolAmount} SOL (tx: ${txSignature})`);
    
    return {
      success: true,
      tokenAmount: actualTokenAmount,
      solAmount: buybackSolAmount,
      solAmountReserved: solAmount - buybackSolAmount,
      txSignature,
      mock: true
    };
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