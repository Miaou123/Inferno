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
  maxSlippage: parseFloat(process.env.MAX_SLIPPAGE_PERCENT) || 2
};

/**
 * Execute token buyback using SOL
 * @param {Number} solAmount - Amount of SOL to use for buyback
 * @param {String} rewardId - Storage ID of the reward record
 * @returns {Promise<Object>} Buyback result
 */
const executeBuyback = async (solAmount, rewardId) => {
  try {
    // Use only 95% of the SOL for buyback to maintain reserve for transaction fees
    const buybackSolAmount = solAmount * 0.95;
    logger.info(`Executing buyback with ${buybackSolAmount} SOL (95% of ${solAmount} SOL, reserving 5% for fees)`);
    
    // Get token price
    const { tokenPriceInSol } = await fetchTokenPrice();
    
    // Calculate amount of tokens to buy (accounting for slippage)
    const slippageBuffer = 1 - (config.maxSlippage / 100);
    const expectedTokenAmount = (buybackSolAmount / tokenPriceInSol) * slippageBuffer;
    
    logger.info(`Expected token amount: ${expectedTokenAmount} at price ${tokenPriceInSol} SOL per token`);
    
    // TODO: Integrate with pump.fun's swap API to execute the buyback
    // This is a placeholder implementation
    // In production, you would integrate with their swap functionality
    
    // For now, simulate successful buyback
    const actualTokenAmount = expectedTokenAmount * 0.99; // Simulate slight slippage
    const txSignature = 'simulated_buyback_tx_signature';
    
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
    
    logger.info(`Bought ${actualTokenAmount} tokens with ${buybackSolAmount} SOL (tx: ${txSignature}), reserved ${solAmount - buybackSolAmount} SOL for fees`);
    return {
      success: true,
      tokenAmount: actualTokenAmount,
      solAmount: buybackSolAmount,
      solAmountReserved: solAmount - buybackSolAmount,
      txSignature
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
    
    return { success: false, error: error.message };
  }
};

module.exports = {
  executeBuyback
};