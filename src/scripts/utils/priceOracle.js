/**
 * Price Oracle for $INFERNO token
 * 
 * Fetches and caches token price data using DexScreener API
 */
const axios = require('axios');
const logger = require('./logger').price;
const { Connection, PublicKey } = require('@solana/web3.js');
const fileStorage = require('./fileStorage');
require('dotenv').config();

// Cache duration in milliseconds (15 minutes)
const CACHE_DURATION_MS = 15 * 60 * 1000;

// Rate limiter for DexScreener API (max 300 requests per minute)
const RATE_LIMIT_INTERVAL = 500; // Ensure at least 500ms between requests (~120 per minute to be safe)
let lastRequestTimestamp = 0;

// Store data in memory cache
let priceCache = {
  lastUpdated: null,
  tokenPriceInSol: null,
  tokenPriceInUsd: null,
  solPriceInUsd: null,
  source: 'dexscreener',
  marketCap: null
};

/**
 * Fetch token price from DexScreener API
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
    
    logger.info('Fetching fresh token price data from DexScreener');
    
    // Use DexScreener API
    const dexScreenerData = await fetchFromDexScreener();
    updateCache(dexScreenerData, 'dexscreener');
    
    return dexScreenerData;
  } catch (error) {
    logger.error(`Error fetching token price: ${error.message}`);
    throw error;
  }
};

/**
 * Rate-limited fetch function for DexScreener API
 * @param {String} url - The API URL to fetch from
 * @returns {Promise<Object>} The API response
 */
async function rateLimitedFetch(url) {
  const now = Date.now();
  const timeElapsed = now - lastRequestTimestamp;
  
  // If the time since the last request is less than our limit, wait for the difference
  if (timeElapsed < RATE_LIMIT_INTERVAL) {
    const waitTime = RATE_LIMIT_INTERVAL - timeElapsed;
    logger.debug(`Rate limiting: waiting ${waitTime}ms before next request`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  
  // Update the last request timestamp
  lastRequestTimestamp = Date.now();
  
  // Perform the fetch with axios
  return axios.get(url);
}

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
 * Fetch price data from DexScreener API
 * @returns {Promise<Object>} Price data
 */
const fetchFromDexScreener = async () => {
  try {
    const tokenAddress = process.env.TOKEN_ADDRESS;
    
    if (!tokenAddress) {
      throw new Error('TOKEN_ADDRESS not set in environment');
    }
    
    // Fetch token data
    logger.info(`Fetching data for token: ${tokenAddress}`);
    const tokenResponse = await rateLimitedFetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`);
    
    if (!tokenResponse.data || !tokenResponse.data.pairs || tokenResponse.data.pairs.length === 0) {
      throw new Error(`DexScreener API error: No pair data found for token ${tokenAddress}`);
    }
    
    // Fetch SOL data for USD conversion
    logger.info('Fetching SOL price data');
    const solResponse = await rateLimitedFetch('https://api.dexscreener.com/latest/dex/tokens/So11111111111111111111111111111111111111112');
    
    if (!solResponse.data || !solResponse.data.pairs || solResponse.data.pairs.length === 0) {
      throw new Error('DexScreener API error: No pair data found for SOL');
    }
    
    // Extract token data from response
    const tokenPair = tokenResponse.data.pairs[0];
    const solPair = solResponse.data.pairs[0];
    
    // Get prices
    const tokenPriceInUsd = parseFloat(tokenPair.priceUsd || 0);
    const solPriceInUsd = parseFloat(solPair.priceUsd || 0);
    
    // Calculate token price in SOL
    const tokenPriceInSol = solPriceInUsd > 0 ? tokenPriceInUsd / solPriceInUsd : 0;
    
    // Extract additional useful data for debugging and monitoring
    const pairInfo = {
      dexId: tokenPair.dexId,
      pairAddress: tokenPair.pairAddress,
      baseTokenSymbol: tokenPair.baseToken.symbol,
      baseTokenName: tokenPair.baseToken.name,
      liquidity: tokenPair.liquidity?.usd || 0,
      volume24h: tokenPair.volume?.h24 || 0,
      priceChange24h: tokenPair.priceChange?.h24 || 0
    };
    
    // Calculate market cap
    const fixedSupply = Number(process.env.INITIAL_SUPPLY) || 1000000000; // 1 billion tokens
    const marketCap = tokenPriceInUsd * fixedSupply;
    const marketCapInSol = tokenPriceInSol * fixedSupply;
    
    // Log data from DexScreener
    logger.info(`DexScreener data:
      - Token: ${tokenAddress}
      - Symbol: ${pairInfo.baseTokenSymbol}
      - Price USD: ${tokenPriceInUsd}
      - Price SOL: ${tokenPriceInSol}
      - Market Cap: $${marketCap.toFixed(2)}
      - Liquidity: $${pairInfo.liquidity}
      - 24h Change: ${pairInfo.priceChange24h}%
    `);
    
    return {
      tokenPriceInSol,
      tokenPriceInUsd,
      solPriceInUsd,
      marketCap,
      marketCapInSol,
      pairInfo  // Include additional pair info
    };
  } catch (error) {
    logger.error(`Error fetching from DexScreener: ${error.message}`);
    throw error;
  }
};

/**
 * Get current token market cap - DexScreener price × supply
 * @returns {Promise<Number>} Market cap in USD
 */
const getMarketCap = async () => {
  try {
    // Get price data from DexScreener API
    const priceData = await fetchTokenPrice();
    
    if (!priceData || !priceData.marketCap) {
      // Calculate market cap using total supply if not available in price data
      const initialSupply = Number(process.env.INITIAL_SUPPLY) || 1000000000;
      const marketCap = priceData.tokenPriceInUsd * initialSupply;
      
      logger.info(`Calculated market cap: $${marketCap.toFixed(2)} (price: $${priceData.tokenPriceInUsd} × supply: ${initialSupply})`);
      return marketCap;
    }
    
    logger.info(`Retrieved market cap: $${priceData.marketCap.toFixed(2)}`);
    return priceData.marketCap;
  } catch (error) {
    logger.error(`Error calculating market cap: ${error.message}`);
    // Return fallback value if there's an error to prevent the monitoring system from breaking
    return 0;
  }
};

/**
 * Simple function to get circulating supply
 * Uses a fixed value for simplicity since we're tracking burns separately
 * @returns {Number} Circulating supply
 */
const getCirculatingSupply = () => {
  // We track burns separately in burnTracker
  // This just returns the initial supply as it's only used for market cap calculation
  const initialSupply = Number(process.env.INITIAL_SUPPLY) || 1000000000;
  return initialSupply;
};

/**
 * Get simple price metrics - price data and market stats
 * @returns {Promise<Object>} Price metrics
 */
const getTokenMetrics = async () => {
  try {
    // Get fresh price data from DexScreener
    const priceData = await fetchTokenPrice();
    
    // Prepare metrics response
    const priceMetrics = {
      priceInSol: priceData.tokenPriceInSol,
      priceInUsd: priceData.tokenPriceInUsd,
      solPriceInUsd: priceData.solPriceInUsd,
      marketCap: priceData.marketCap,
      timestamp: new Date().toISOString(),
      priceSource: priceData.source,
      pairInfo: priceData.pairInfo || {}, // Include additional pair info if available
      lastUpdated: new Date(priceData.lastUpdated).toISOString()
    };
    
    return priceMetrics;
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
      logger.warn('DexScreener API supports max 10 tokens in batch request, truncating list');
      tokenAddresses = tokenAddresses.slice(0, 10);
    }
    
    logger.info(`Fetching prices for ${tokenAddresses.length} tokens`);
    
    // Use DexScreener batch API to get multiple token prices
    const response = await rateLimitedFetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddresses.join(',')}`);
    
    if (!response.data || !response.data.pairs) {
      logger.warn('No pair data returned from DexScreener batch API');
      return {};
    }
    
    // Extract token prices from response
    const prices = {};
    response.data.pairs.forEach(pair => {
      if (pair.baseToken && pair.baseToken.address) {
        prices[pair.baseToken.address] = {
          priceUsd: parseFloat(pair.priceUsd || 0),
          symbol: pair.baseToken.symbol,
          liquidity: pair.liquidity?.usd || 0,
          volume24h: pair.volume?.h24 || 0
        };
      }
    });
    
    logger.info(`Retrieved prices for ${Object.keys(prices).length} tokens`);
    return prices;
  } catch (error) {
    logger.error(`Error fetching multiple token prices: ${error.message}`);
    return {};
  }
};

module.exports = {
  fetchTokenPrice,
  refreshPriceCache,
  getMarketCap,
  getCirculatingSupply,
  getTokenMetrics,
  getMultipleTokenPrices
};