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
  source: null,
  marketCap: null
};

/**
 * Fetch token price from Birdeye API with fallback
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
    
    // In mock mode, return synthetic data
    if (process.env.MOCK_MODE === 'true') {
      const mockData = getMockPriceData();
      updateCache(mockData, 'mock');
      return mockData;
    }
    
    // Try primary source (Birdeye)
    try {
      const birdeyeData = await fetchFromBirdeye();
      updateCache(birdeyeData, 'birdeye');
      
      // Skip saving price history as requested by user
      return birdeyeData;
    } catch (birdeyeError) {
      logger.warn(`Birdeye fetch failed: ${birdeyeError.message}, trying fallback source`);
      
      // Try fallback source (Jupiter etc.)
      try {
        const fallbackData = await fetchFromFallbackSource();
        updateCache(fallbackData, 'fallback');
        
        // Skip saving price history as requested by user
        return fallbackData;
      } catch (fallbackError) {
        logger.error(`Fallback price fetch failed: ${fallbackError.message}`);
        
        // If all fails, use the last valid cached data if available
        if (priceCache.lastUpdated) {
          logger.warn('Using stale cached price data as all sources failed');
          priceCache.source = 'stale-cache';
          return priceCache;
        }
        
        // If no cache, return error
        throw new Error('All price sources failed');
      }
    }
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
    const tokenPriceInUsd = tokenPriceInSol * solPriceInUsd;
    
    // Get circulating supply for market cap calculation
    const circulatingSupply = await getCirculatingSupply();
    const marketCap = tokenPriceInUsd * circulatingSupply;
    
    return {
      tokenPriceInSol,
      tokenPriceInUsd,
      solPriceInUsd,
      marketCap
    };
  } catch (error) {
    logger.error(`Error fetching from Birdeye: ${error.message}`);
    throw error;
  }
};

/**
 * Fetch price data from fallback source
 * @returns {Promise<Object>} Price data
 */
const fetchFromFallbackSource = async () => {
  // Implement fallback price source
  // This could be Jupiter, CoinGecko, or another API
  
  // For now, we'll use simple mock data
  // In a real implementation, this would connect to a different API
  logger.info('Using fallback price source');
  
  try {
    // Since we're not saving price history, let's skip this check
    // and just use mock data directly
    logger.info('Skipping price history check - using mock data directly');
    const priceHistory = [];
    
    if (priceHistory.length > 0) {
      const latestPrice = priceHistory[0];
      logger.info(`Using recent price history as fallback from: ${latestPrice.timestamp}`);
      
      return {
        tokenPriceInSol: latestPrice.tokenPriceInSol,
        tokenPriceInUsd: latestPrice.tokenPriceInUsd,
        solPriceInUsd: latestPrice.solPriceInUsd,
        marketCap: latestPrice.marketCap
      };
    }
    
    // If no history, use mock data with warning
    logger.warn('No price history available, using mock fallback data');
    return getMockPriceData();
  } catch (error) {
    logger.error(`Error in fallback price source: ${error.message}`);
    throw error;
  }
};

/**
 * Get mock price data for testing
 * @returns {Object} Mock price data
 */
const getMockPriceData = () => {
  return {
    tokenPriceInSol: 0.0000005,
    solPriceInUsd: 100,
    tokenPriceInUsd: 0.0000005 * 100,
    marketCap: 0.0000005 * 100 * 700000000 // Assuming 70% of supply is circulating
  };
};

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

/**
 * Get current token market cap
 * @returns {Promise<Number>} Market cap in USD
 */
const getMarketCap = async () => {
  try {
    // Get price data
    const priceData = await fetchTokenPrice();
    
    // If we have market cap directly, use it
    if (priceData.marketCap) {
      return priceData.marketCap;
    }
    
    // Otherwise calculate from circulating supply
    const circulatingSupply = await getCirculatingSupply();
    return priceData.tokenPriceInUsd * circulatingSupply;
  } catch (error) {
    logger.error(`Error calculating market cap: ${error.message}`);
    
    // Fallback to stored metrics
    try {
      const metrics = fileStorage.findRecords('metrics', () => true, {
        sort: { field: 'timestamp', order: 'desc' },
        limit: 1
      });
      
      if (metrics.length > 0 && metrics[0].marketCap) {
        logger.info('Using market cap from stored metrics as fallback');
        return metrics[0].marketCap;
      }
    } catch (storageError) {
      logger.error(`Error getting market cap from storage: ${storageError.message}`);
    }
    
    throw error;
  }
};

/**
 * Get token supply information directly from the blockchain
 * @returns {Promise<Object>} Supply information
 */
const getTokenSupplyFromChain = async () => {
  try {
    const connection = new Connection(process.env.SOLANA_RPC_URL);
    const tokenMint = new PublicKey(process.env.TOKEN_ADDRESS);
    
    // Get token supply from chain
    const tokenSupplyInfo = await connection.getTokenSupply(tokenMint);
    
    // Get burn address balance
    const burnAddress = new PublicKey(process.env.BURN_ADDRESS || "1nc1nerator11111111111111111111111111111111");
    const burnAccounts = await connection.getTokenAccountsByOwner(burnAddress, { mint: tokenMint });
    
    let burnedAmount = 0;
    if (burnAccounts.value.length > 0) {
      for (const account of burnAccounts.value) {
        const accountInfo = await connection.getTokenAccountBalance(account.pubkey);
        burnedAmount += accountInfo.value.uiAmount;
      }
    }
    
    // Log what we found
    logger.info(`On-chain token data: 
      - Total Supply: ${tokenSupplyInfo.value.uiAmount}
      - Decimals: ${tokenSupplyInfo.value.decimals}
      - Burned (in burn address): ${burnedAmount}
    `);
    
    return {
      totalSupply: tokenSupplyInfo.value.uiAmount,
      circulatingSupply: tokenSupplyInfo.value.uiAmount - burnedAmount,
      burnedAmount: burnedAmount
    };
  } catch (error) {
    logger.error(`Error getting token supply from chain: ${error.message}`);
    throw error;
  }
};

/**
 * Get current circulating supply
 * @returns {Promise<Number>} Circulating supply
 */
const getCirculatingSupply = async () => {
  try {
    // Try to get actual on-chain data first
    try {
      const onChainData = await getTokenSupplyFromChain();
      logger.info(`Using on-chain circulating supply: ${onChainData.circulatingSupply}`);
      return onChainData.circulatingSupply;
    } catch (chainError) {
      logger.warn(`Couldn't get on-chain supply data: ${chainError.message}, falling back to records`);
    }
    
    // If on-chain fails, try calculating from burn records
    try {
      const initialSupply = Number(process.env.INITIAL_SUPPLY) || 1000000000;
      const burns = fileStorage.readData(fileStorage.FILES.burns);
      const totalBurned = burns.reduce((sum, burn) => sum + (burn.burnAmount || 0), 0);
      
      logger.info(`Calculated from burn records: Supply ${initialSupply}, Burns ${totalBurned}, Circulating ${initialSupply - totalBurned}`);
      return initialSupply - totalBurned;
    } catch (recordError) {
      logger.warn(`Couldn't calculate from burn records: ${recordError.message}, falling back to metrics`);
    }
    
    // If that fails too, use stored metrics (last resort)
    const metrics = fileStorage.findRecords('metrics', () => true, {
      sort: { field: 'timestamp', order: 'desc' },
      limit: 1
    });
    
    if (metrics.length > 0) {
      logger.info(`Using stored metrics for circulating supply: ${metrics[0].circulatingSupply}`);
      return metrics[0].circulatingSupply;
    }
    
    // Ultimate fallback
    const initialSupply = Number(process.env.INITIAL_SUPPLY) || 1000000000;
    logger.warn(`All methods failed, using default 70% of supply: ${initialSupply * 0.7}`);
    return initialSupply * 0.7;
  } catch (error) {
    logger.error(`Error calculating circulating supply: ${error.message}`);
    const initialSupply = Number(process.env.INITIAL_SUPPLY) || 1000000000;
    return initialSupply * 0.7;
  }
};

/**
 * Update metrics with accurate on-chain data
 */
const updateMetricsFromChain = async () => {
  try {
    // Get on-chain data
    const onChainData = await getTokenSupplyFromChain();
    
    // Get the latest metrics
    const metrics = fileStorage.findRecords('metrics', () => true, {
      sort: { field: 'timestamp', order: 'desc' },
      limit: 1
    });
    
    // Create updated metrics
    const updatedMetrics = {
      timestamp: new Date().toISOString(),
      totalSupply: onChainData.totalSupply,
      circulatingSupply: onChainData.circulatingSupply,
      reserveWalletBalance: metrics.length > 0 ? metrics[0].reserveWalletBalance : 0,
      totalBurned: onChainData.burnedAmount,
      buybackBurned: metrics.length > 0 ? metrics[0].buybackBurned : 0,
      milestoneBurned: metrics.length > 0 ? metrics[0].milestoneBurned : 0,
      updatedFromChain: true
    };
    
    // Save the updated metrics
    fileStorage.saveRecord('metrics', updatedMetrics);
    logger.info(`Updated metrics from chain data: Total Supply ${onChainData.totalSupply}, Circulating ${onChainData.circulatingSupply}, Burned ${onChainData.burnedAmount}`);
    
    return updatedMetrics;
  } catch (error) {
    logger.error(`Error updating metrics from chain: ${error.message}`);
    throw error;
  }
};

/**
 * Get complete token metrics
 * @returns {Promise<Object>} Token metrics
 */
const getTokenMetrics = async () => {
  try {
    // Get latest metrics from storage
    const metrics = fileStorage.findRecords('metrics', () => true, {
      sort: { field: 'timestamp', order: 'desc' },
      limit: 1
    });
    
    let latestMetrics = metrics.length > 0 ? metrics[0] : null;
    
    // Get fresh price data
    const priceData = await fetchTokenPrice();
    
    // If we don't have metrics, create a baseline
    if (!latestMetrics) {
      const initialSupply = Number(process.env.INITIAL_SUPPLY) || 1000000000;
      const reservePercent = 0.3;
      
      latestMetrics = {
        totalSupply: initialSupply,
        circulatingSupply: initialSupply * (1 - reservePercent),
        reserveWalletBalance: initialSupply * reservePercent,
        totalBurned: 0,
        buybackBurned: 0,
        milestoneBurned: 0
      };
    }
    
    // Update metrics with price data
    const updatedMetrics = {
      ...latestMetrics,
      priceInSol: priceData.tokenPriceInSol,
      priceInUsd: priceData.tokenPriceInUsd,
      solPriceInUsd: priceData.solPriceInUsd,
      marketCap: priceData.tokenPriceInUsd * latestMetrics.circulatingSupply,
      timestamp: new Date().toISOString(),
      priceLastUpdated: priceData.timestamp || new Date().toISOString(),
      priceSource: priceData.source
    };
    
    return updatedMetrics;
  } catch (error) {
    logger.error(`Error getting token metrics: ${error.message}`);
    throw error;
  }
};

module.exports = {
  fetchTokenPrice,
  refreshPriceCache,
  getMarketCap,
  getCirculatingSupply,
  getTokenMetrics
};