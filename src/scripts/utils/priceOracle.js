/**
 * Price Oracle for $INFERNO token
 * Fetches token price data using DexScreener API with caching
 */
const axios = require('axios');
const logger = require('./logger').price;
const EventEmitter = require('events');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

// Create event emitter for price updates
const priceEvents = new EventEmitter();

// Cache for price data
let cachedPriceData = null;
let lastUpdateTimestamp = 0;
const CACHE_TTL_MS = 30000; // 30 seconds cache lifetime

// Rate limiter for DexScreener API (max 300 requests per minute)
const RATE_LIMIT_INTERVAL = 500; // ~120 per minute to be safe
let lastRequestTimestamp = 0;

/**
 * Rate-limited fetch function for DexScreener API
 * @param {String} url - The API URL to fetch from
 * @returns {Promise<Object>} The API response
 */
async function rateLimitedFetch(url) {
  const now = Date.now();
  const timeElapsed = now - lastRequestTimestamp;
  
  // Wait if needed for rate limiting
  if (timeElapsed < RATE_LIMIT_INTERVAL) {
    const waitTime = RATE_LIMIT_INTERVAL - timeElapsed;
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  
  // Update the last request timestamp
  lastRequestTimestamp = Date.now();
  
  // Perform the fetch with axios
  return axios.get(url);
}

/**
 * Fetch price data from DexScreener API
 * @param {Boolean} forceRefresh - Force a fresh fetch ignoring cache
 * @returns {Promise<Object>} Price data
 */
const fetchFromDexScreener = async (forceRefresh = false) => {
  try {
    const now = Date.now();
    
    // Use cached data if available, fresh enough, and not forcing refresh
    if (!forceRefresh && cachedPriceData && (now - lastUpdateTimestamp) < CACHE_TTL_MS) {
      logger.debug('Using cached price data');
      return cachedPriceData;
    }
    
    const tokenAddress = process.env.TOKEN_ADDRESS;
    
    if (!tokenAddress) {
      throw new Error('TOKEN_ADDRESS not set in environment');
    }
    
    logger.debug(`Fetching fresh price data for ${tokenAddress}`);
    
    // Fetch token data
    const tokenResponse = await rateLimitedFetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`);
    
    if (!tokenResponse.data || !tokenResponse.data.pairs || tokenResponse.data.pairs.length === 0) {
      throw new Error(`No pair data found for token ${tokenAddress}`);
    }
    
    // Fetch SOL data for USD conversion
    const solResponse = await rateLimitedFetch('https://api.dexscreener.com/latest/dex/tokens/So11111111111111111111111111111111111111112');
    
    if (!solResponse.data || !solResponse.data.pairs || solResponse.data.pairs.length === 0) {
      throw new Error('No pair data found for SOL');
    }
    
    // Extract token data from response
    const tokenPair = tokenResponse.data.pairs[0];
    const solPair = solResponse.data.pairs[0];
    
    // Get prices
    const tokenPriceInUsd = parseFloat(tokenPair.priceUsd || 0);
    const solPriceInUsd = parseFloat(solPair.priceUsd || 0);
    
    // Calculate token price in SOL
    const tokenPriceInSol = solPriceInUsd > 0 ? tokenPriceInUsd / solPriceInUsd : 0;
    
    // Extract basic pair info
    const pairInfo = {
      baseTokenSymbol: tokenPair.baseToken.symbol,
      baseTokenName: tokenPair.baseToken.name,
      priceChange24h: tokenPair.priceChange?.h24 || 0,
      lastUpdated: new Date().toISOString()
    };
    
    // Get supplies from env with fallbacks
    const initialSupply = Number(process.env.INITIAL_SUPPLY) || 1000000000; // 1 billion tokens
    
    // Calculate market caps
    const marketCap = tokenPriceInUsd * initialSupply;
    const marketCapInSol = tokenPriceInSol * initialSupply;
    
    // Create price data object
    const priceData = {
      tokenPriceInSol,
      tokenPriceInUsd,
      solPriceInUsd,
      marketCap,
      marketCapInSol,
      pairInfo,
      timestamp: new Date().toISOString(),
      cacheAge: 0  // New data has 0 age
    };
    
    // Update cache
    cachedPriceData = priceData;
    lastUpdateTimestamp = now;

    const priceFile = path.join(__dirname, '../../../data/latest-price.json');
    fs.writeFileSync(priceFile, JSON.stringify(priceData));
    
    // Emit event with the new price data so other components can react
    priceEvents.emit('priceUpdate', priceData);
    logger.info(`Price updated: $${priceData.tokenPriceInUsd.toFixed(8)} USD, MC: $${priceData.marketCap.toFixed(2)}`);
    
    return priceData;
  } catch (error) {
    logger.error(`Error fetching from DexScreener: ${error.message}`);
    
    // If we have cached data and there's an error, return the cached data
    if (cachedPriceData) {
      logger.warn('Returning cached data due to fetch error');
      // Update cache age
      cachedPriceData.cacheAge = Date.now() - lastUpdateTimestamp;
      return cachedPriceData;
    }
    
    throw error;
  }
};

/**
 * Get the latest price data (from cache when possible)
 * @returns {Promise<Object>} Price data
 */
const getLatestPrice = async () => {
  // Use cache if available and not too old
  return await fetchFromDexScreener(false);
};

/**
 * Get current token market cap (using cached data when possible)
 * @returns {Promise<Number>} Market cap in USD
 */
const getMarketCap = async () => {
  try {
    // Get price data, preferring cached data when fresh
    const priceData = await getLatestPrice();
    
    if (!priceData || !priceData.marketCap) {
      const initialSupply = Number(process.env.INITIAL_SUPPLY) || 1000000000;
      const marketCap = priceData?.tokenPriceInUsd * initialSupply || 0;
      return marketCap;
    }
    
    return priceData.marketCap;
  } catch (error) {
    logger.error(`Error calculating market cap: ${error.message}`);
    // Return fallback value if there's an error to prevent the monitoring system from breaking
    return 0;
  }
};

/**
 * Get circulating supply
 * @returns {Number} Circulating supply
 */
const getCirculatingSupply = () => {
  const initialSupply = Number(process.env.INITIAL_SUPPLY) || 1000000000;
  return initialSupply;
};

/**
 * Get price metrics for API responses
 * @returns {Promise<Object>} Price metrics
 */
const getTokenMetrics = async () => {
  try {
    // Use cached data when possible
    const priceData = await getLatestPrice();
    
    return {
      priceInSol: priceData.tokenPriceInSol,
      priceInUsd: priceData.tokenPriceInUsd,
      solPriceInUsd: priceData.solPriceInUsd,
      marketCap: priceData.marketCap,
      timestamp: new Date().toISOString(),
      cacheTimestamp: priceData.timestamp,
      cacheAge: Date.now() - lastUpdateTimestamp,
      pairInfo: priceData.pairInfo || {}
    };
  } catch (error) {
    logger.error(`Error getting token price metrics: ${error.message}`);
    throw error;
  }
};

/**
 * Get multiple token prices (uses DexScreener batch API)
 * @param {Array} tokenAddresses - Array of token addresses (max 10)
 * @returns {Promise<Object>} Object mapping token addresses to prices
 */
const getMultipleTokenPrices = async (tokenAddresses) => {
  try {
    if (!Array.isArray(tokenAddresses) || tokenAddresses.length === 0) {
      throw new Error('Invalid input: tokenAddresses must be a non-empty array');
    }
    
    if (tokenAddresses.length > 10) {
      tokenAddresses = tokenAddresses.slice(0, 10); // Max 10 tokens per request
    }
    
    const response = await rateLimitedFetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddresses.join(',')}`);
    
    if (!response.data || !response.data.pairs) {
      return {};
    }
    
    // Extract token prices from response
    const prices = {};
    response.data.pairs.forEach(pair => {
      if (pair.baseToken && pair.baseToken.address) {
        prices[pair.baseToken.address] = {
          priceUsd: parseFloat(pair.priceUsd || 0),
          symbol: pair.baseToken.symbol
        };
      }
    });
    
    return prices;
  } catch (error) {
    logger.error(`Error fetching multiple token prices: ${error.message}`);
    return {};
  }
};

/**
 * Manually refresh price cache
 * @returns {Promise<Object>} Fresh price data
 */
const refreshPriceCache = async () => {
  try {
    logger.info('Manually refreshing price cache');
    return await fetchFromDexScreener(true); // Force refresh
  } catch (error) {
    logger.error(`Manual price refresh failed: ${error.message}`);
    throw error;
  }
};

// Run an initial price fetch to have data right away
fetchFromDexScreener()
  .then(data => logger.info(`Initial price fetch completed: $${data.tokenPriceInUsd.toFixed(8)} USD`))
  .catch(error => logger.error(`Initial price fetch failed: ${error.message}`));

module.exports = {
  fetchFromDexScreener,
  getLatestPrice,
  getMarketCap,
  getCirculatingSupply,
  getTokenMetrics,
  getMultipleTokenPrices,
  refreshPriceCache,
  priceEvents
};