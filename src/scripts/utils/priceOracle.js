/**
 * Price Oracle for $INFERNO token
 * 
 * Fetches and caches token price data with fallback mechanisms
 */
const axios = require('axios');
const logger = require('./logger').price;
const { Connection, PublicKey } = require('@solana/web3.js');
const fileStorage = require('./fileStorage');
require('dotenv').config();

// Cache duration in milliseconds (15 minutes)
const CACHE_DURATION_MS = 15 * 60 * 1000;

// Store data in memory cache
let priceCache = {
  lastUpdated: null,
  tokenPriceInSol: null,
  tokenPriceInUsd: null,
  solPriceInUsd: null,
  source: 'birdeye',  // Only using Birdeye as source
  marketCap: null
};

/**
 * Fetch token price from Birdeye API (no fallback)
 * @returns {Promise<Object>} Price data
 */
const fetchTokenPrice = async () => {
  try {
    // Check if we have fresh cache data
    const now = Date.now();
    if (
      priceCache.lastUpdated && 
      now - priceCache.lastUpdated < CACHE_DURATION_MS &&
      priceCache.tokenPriceInSol && 
      priceCache.tokenPriceInUsd
    ) {
      logger.debug('Using cached price data');
      return priceCache;
    }
    
    logger.info('Fetching fresh token price data');
    
    // Use ONLY Birdeye API - no fallbacks, no mocks
    const birdeyeData = await fetchFromBirdeye();
    updateCache(birdeyeData, 'birdeye');
    
    // Return real data from Birdeye only
    return birdeyeData;
  } catch (error) {
    logger.error(`Error fetching token price: ${error.message}`);
    throw error;
  }
};

/**
 * Update the price cache
 * @param {Object} data - Price data
 * @param {String} source - Data source
 */
const updateCache = (data, source) => {
  priceCache = {
    ...data,
    lastUpdated: Date.now(),
    source,
    timestamp: new Date().toISOString()
  };
};

/**
 * Force refresh of cached price data
 * @returns {Promise<Object>} Fresh price data
 */
const refreshPriceCache = async () => {
  logger.info('Manually refreshing price cache');
  
  // Clear the cache timestamp to force refresh
  priceCache.lastUpdated = null;
  
  // Fetch fresh data
  return await fetchTokenPrice();
};

/**
 * Fetch price data from Birdeye API
 * @returns {Promise<Object>} Price data
 */
const fetchFromBirdeye = async () => {
  try {
    const apiKey = process.env.BIRDEYE_API_KEY;
    const apiUrl = process.env.BIRDEYE_API_URL || 'https://public-api.birdeye.so/defi/price';
    const tokenAddress = process.env.TOKEN_ADDRESS;
    
    if (!apiKey) {
      throw new Error('BIRDEYE_API_KEY not set in environment');
    }
    
    if (!tokenAddress) {
      throw new Error('TOKEN_ADDRESS not set in environment');
    }
    
    // Fetch token data
    const tokenResponse = await axios.get(`${apiUrl}?address=${tokenAddress}`, {
      headers: {
        'X-API-KEY': apiKey
      }
    });
    
    if (tokenResponse.status !== 200 || !tokenResponse.data.success) {
      throw new Error(`Birdeye API error: ${tokenResponse.data.error || 'Unknown error'}`);
    }
    
    const tokenData = tokenResponse.data.data;
    
    // Fetch SOL data for USD conversion
    const solResponse = await axios.get(`${apiUrl}?address=So11111111111111111111111111111111111111112`, {
      headers: {
        'X-API-KEY': apiKey
      }
    });
    
    if (solResponse.status !== 200 || !solResponse.data.success) {
      throw new Error(`Birdeye API error for SOL: ${solResponse.data.error || 'Unknown error'}`);
    }
    
    const solData = solResponse.data.data;
    
    // Calculate derived values
    const tokenPriceInSol = tokenData.value;
    const solPriceInUsd = solData.value;
    
    // Calculate market cap (SOL amount) then convert to USD
    const fixedSupply = 1000000000; // 1 billion tokens
    const marketCapInSol = tokenPriceInSol * fixedSupply;
    const marketCap = marketCapInSol * solPriceInUsd;
    
    // Calculate token price in USD
    const tokenPriceInUsd = tokenPriceInSol * solPriceInUsd;
    
    // Log real data directly from Birdeye
    logger.info(`REAL DATA from Birdeye:
      - Token: ${tokenAddress}
      - Price: ${tokenPriceInSol}
      - Market Cap: ${marketCapInSol} SOL
    `);
    
    return {
      tokenPriceInSol,
      tokenPriceInUsd,
      solPriceInUsd,
      marketCap,
      marketCapInSol
    };
  } catch (error) {
    logger.error(`Error fetching from Birdeye: ${error.message}`);
    throw error;
  }
};

// No fallback sources - we only use real Birdeye data

/**
 * Save price data to history
 * @param {Object} priceData - Price data
 * @param {String} source - Data source
 */
const savePriceHistory = (priceData, source) => {
  // Skip saving price history as requested by user
  logger.debug(`Current price: ${priceData.tokenPriceInUsd} USD (${priceData.tokenPriceInSol} SOL) from ${source}`);
  return;
};

/**Get current token market cap - Birdeye price × supply
 * @returns {Promise<Number>} Market cap in USD
 */
const getMarketCap = async () => {
  try {
    // Get price data from Birdeye API
    const priceData = await fetchTokenPrice();
    
    // Calculate market cap using total supply
    const initialSupply = Number(process.env.INITIAL_SUPPLY) || 1000000000;
    const marketCap = priceData.tokenPriceInSol * initialSupply;
    
    logger.info(`Calculated market cap: $${marketCap.toFixed(2)} (price: $${priceData.tokenPriceInSol} × supply: ${initialSupply})`);
    return marketCap;
  } catch (error) {
    logger.error(`Error calculating market cap: ${error.message}`);
    throw error;
  }
};

/**
 * Simple function to get circulating supply
 * Uses a fixed value for simplicity since we're tracking burns separately
 * @returns {Number} Circulating supply
 */
const getCirculatingSupply = () => {
  // We now track burns separately in burnTracker
  // This is just returning the initial supply as it's only used for market cap calculation
  const initialSupply = Number(process.env.INITIAL_SUPPLY) || 1000000000;
  return initialSupply;
};

/**
 * Get simple price metrics - ONLY price data, nothing else
 * @returns {Promise<Object>} Price metrics
 */
const getTokenMetrics = async () => {
  try {
    // Get fresh price data from Birdeye
    const priceData = await fetchTokenPrice();
    
    // Calculate market cap from fixed supply
    const initialSupply = Number(process.env.INITIAL_SUPPLY) || 1000000000;
    const marketCap = priceData.tokenPriceInUsd * initialSupply;
    
    // Create simple price metrics response
    const priceMetrics = {
      priceInSol: priceData.tokenPriceInSol,
      priceInUsd: priceData.tokenPriceInUsd,
      solPriceInUsd: priceData.solPriceInUsd,
      marketCap: marketCap,
      timestamp: new Date().toISOString(),
      priceSource: priceData.source
    };
    
    return priceMetrics;
  } catch (error) {
    logger.error(`Error getting token price metrics: ${error.message}`);
    throw error;
  }
};

module.exports = {
  fetchTokenPrice,
  refreshPriceCache,
  getMarketCap,
  getCirculatingSupply,
  getTokenMetrics
  // updateMetricsFromChain has been removed as we're now using burnTracker
};