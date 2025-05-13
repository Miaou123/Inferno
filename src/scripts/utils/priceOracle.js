/**
 * Price Oracle utility for $INFERNO token
 * Responsible for fetching token price and calculating market cap
 */
const axios = require('axios');
const { getConnection, getTokenBalance } = require('./solana');
const logger = require('./logger').price;
require('dotenv').config();

// Cache mechanism
let priceCache = {
  tokenPriceInSol: null,
  tokenPriceInUsd: null,
  solPriceInUsd: null,
  marketCap: null,
  circulatingSupply: null,
  lastUpdated: null,
  ttl: 5 * 60 * 1000 // 5 minutes TTL
};

/**
 * Get token price from pump.fun or other APIs
 * @returns {Promise<Object>} Price data
 */
const fetchTokenPrice = async () => {
  try {
    // If cache is valid, return it
    if (priceCache.lastUpdated && (Date.now() - priceCache.lastUpdated < priceCache.ttl)) {
      return {
        tokenPriceInSol: priceCache.tokenPriceInSol,
        tokenPriceInUsd: priceCache.tokenPriceInUsd,
        solPriceInUsd: priceCache.solPriceInUsd
      };
    }
    
    // TODO: Replace with actual API call to PumpSwap or other price oracle
    // This is a simplified implementation
    // In production, you should use a reliable price oracle service
    
    // For PumpSwap, you might use their API or extract from their UI
    // const response = await axios.get(
    //   `https://api.pump.fun/token/${process.env.TOKEN_ADDRESS}/price`
    // );
    
    // For now, simulate with mock data
    // In production, replace with actual price fetching logic
    const mockSolPrice = 100; // USD per SOL
    const mockTokenPrice = 0.00001; // SOL per token
    
    const tokenPriceInSol = mockTokenPrice;
    const solPriceInUsd = mockSolPrice;
    const tokenPriceInUsd = tokenPriceInSol * solPriceInUsd;
    
    // Update cache
    priceCache.tokenPriceInSol = tokenPriceInSol;
    priceCache.tokenPriceInUsd = tokenPriceInUsd;
    priceCache.solPriceInUsd = solPriceInUsd;
    priceCache.lastUpdated = Date.now();
    
    return {
      tokenPriceInSol,
      tokenPriceInUsd,
      solPriceInUsd
    };
  } catch (error) {
    logger.error('Error fetching token price:', error);
    
    // If cache exists, return it even if expired
    if (priceCache.tokenPriceInSol !== null) {
      logger.info('Using expired price cache due to fetch error');
      return {
        tokenPriceInSol: priceCache.tokenPriceInSol,
        tokenPriceInUsd: priceCache.tokenPriceInUsd,
        solPriceInUsd: priceCache.solPriceInUsd,
        isExpiredCache: true
      };
    }
    
    throw new Error(`Failed to fetch token price: ${error.message}`);
  }
};

/**
 * Calculate the current circulating supply
 * @returns {Promise<Number>} Circulating supply
 */
const getCirculatingSupply = async () => {
  try {
    // If cache is valid, return it
    if (priceCache.circulatingSupply && 
        (Date.now() - priceCache.lastUpdated < priceCache.ttl)) {
      return priceCache.circulatingSupply;
    }
    
    const initialSupply = Number(process.env.INITIAL_SUPPLY);
    const burnAddress = process.env.BURN_ADDRESS;
    
    // Get tokens in burn address (these are effectively removed from circulation)
    const burnedTokens = await getTokenBalance(burnAddress);
    
    // Get tokens in reserve wallet (these are not in circulation yet)
    const reserveWalletAddress = process.env.RESERVE_WALLET_ADDRESS;
    const reserveTokens = await getTokenBalance(reserveWalletAddress);
    
    const circulatingSupply = initialSupply - burnedTokens - reserveTokens;
    
    // Update cache
    priceCache.circulatingSupply = circulatingSupply;
    
    return circulatingSupply;
  } catch (error) {
    logger.error('Error calculating circulating supply:', error);
    
    // If cache exists, return it even if expired
    if (priceCache.circulatingSupply !== null) {
      logger.info('Using expired supply cache due to calculation error');
      return priceCache.circulatingSupply;
    }
    
    throw new Error(`Failed to calculate circulating supply: ${error.message}`);
  }
};

/**
 * Calculate current market cap
 * @returns {Promise<Number>} Market cap in USD
 */
const getMarketCap = async () => {
  try {
    // If cache is valid, return it
    if (priceCache.marketCap && 
        (Date.now() - priceCache.lastUpdated < priceCache.ttl)) {
      return priceCache.marketCap;
    }
    
    // Get price and circulating supply
    const { tokenPriceInUsd } = await fetchTokenPrice();
    const circulatingSupply = await getCirculatingSupply();
    
    // Calculate market cap
    const marketCap = tokenPriceInUsd * circulatingSupply;
    
    // Update cache
    priceCache.marketCap = marketCap;
    
    logger.info(`Current market cap: $${marketCap.toLocaleString()}`);
    return marketCap;
  } catch (error) {
    logger.error('Error calculating market cap:', error);
    
    // If cache exists, return it even if expired
    if (priceCache.marketCap !== null) {
      logger.info('Using expired market cap cache due to calculation error');
      return priceCache.marketCap;
    }
    
    throw new Error(`Failed to calculate market cap: ${error.message}`);
  }
};

/**
 * Force refresh the price cache
 */
const refreshPriceCache = async () => {
  try {
    logger.info('Forcibly refreshing price cache');
    
    // Reset cache expiry
    priceCache.lastUpdated = null;
    
    // Fetch fresh data
    const { tokenPriceInSol, tokenPriceInUsd, solPriceInUsd } = await fetchTokenPrice();
    const circulatingSupply = await getCirculatingSupply();
    const marketCap = tokenPriceInUsd * circulatingSupply;
    
    // Update cache
    priceCache = {
      tokenPriceInSol,
      tokenPriceInUsd,
      solPriceInUsd,
      marketCap,
      circulatingSupply,
      lastUpdated: Date.now(),
      ttl: priceCache.ttl
    };
    
    logger.info('Price cache refreshed successfully');
    return priceCache;
  } catch (error) {
    logger.error('Error refreshing price cache:', error);
    throw error;
  }
};

module.exports = {
  fetchTokenPrice,
  getCirculatingSupply,
  getMarketCap,
  refreshPriceCache
};