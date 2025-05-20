/**
 * Price Oracle for $INFERNO token
 * Fetches token price data using DexScreener API
 */
const axios = require('axios');
const logger = require('./logger').price;
const EventEmitter = require('events');
require('dotenv').config();

// Create event emitter for price updates
const priceEvents = new EventEmitter();

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
 * @returns {Promise<Object>} Price data
 */
const fetchFromDexScreener = async () => {
  try {
    const tokenAddress = process.env.TOKEN_ADDRESS;
    
    if (!tokenAddress) {
      throw new Error('TOKEN_ADDRESS not set in environment');
    }
    
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
      priceChange24h: tokenPair.priceChange?.h24 || 0
    };
    
    // Calculate market cap
    const fixedSupply = Number(process.env.INITIAL_SUPPLY) || 1000000000; // 1 billion tokens
    const marketCap = tokenPriceInUsd * fixedSupply;
    const marketCapInSol = tokenPriceInSol * fixedSupply;
    
    const priceData = {
      tokenPriceInSol,
      tokenPriceInUsd,
      solPriceInUsd,
      marketCap,
      marketCapInSol,
      pairInfo,
      timestamp: new Date().toISOString()
    };

    // Emit event with the new price data so milestone system can react
    priceEvents.emit('priceUpdate', priceData);
    logger.info(`Price updated: $${priceData.tokenPriceInUsd.toFixed(8)} USD, MC: $${priceData.marketCap.toFixed(2)}`);
    
    return priceData;
  } catch (error) {
    logger.error(`Error fetching from DexScreener: ${error.message}`);
    throw error;
  }
};

/**
 * Get current token market cap (DexScreener price × supply)
 * @returns {Promise<Number>} Market cap in USD
 */
const getMarketCap = async () => {
  try {
    // Always get fresh price data
    const priceData = await fetchFromDexScreener();
    
    if (!priceData || !priceData.marketCap) {
      const initialSupply = Number(process.env.INITIAL_SUPPLY) || 1000000000;
      const marketCap = priceData.tokenPriceInUsd * initialSupply;
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
    const priceData = await fetchFromDexScreener();
    
    return {
      priceInSol: priceData.tokenPriceInSol,
      priceInUsd: priceData.tokenPriceInUsd,
      solPriceInUsd: priceData.solPriceInUsd,
      marketCap: priceData.marketCap,
      timestamp: new Date().toISOString(),
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

// Run an initial price fetch to have data right away
fetchFromDexScreener().catch(error => {
  logger.error(`Initial price fetch failed: ${error.message}`);
});

module.exports = {
  fetchFromDexScreener,
  getMarketCap,
  getCirculatingSupply,
  getTokenMetrics,
  getMultipleTokenPrices,
  priceEvents
};