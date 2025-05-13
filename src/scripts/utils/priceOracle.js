/**
 * Price Oracle utility for $INFERNO token
 * Responsible for fetching token price and calculating market cap
 * Uses Birdeye for price data and Helius for on-chain data
 */
const axios = require('axios');
const { PublicKey } = require('@solana/web3.js');
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
 * Get token price from Birdeye API
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
    
    // Fetch token price from Birdeye
    const response = await axios.get(process.env.BIRDEYE_API_URL, {
      params: {
        address: process.env.TOKEN_ADDRESS,
        include_liquidity: true
      },
      headers: {
        'x-chain': 'solana',
        'X-API-KEY': process.env.BIRDEYE_API_KEY
      }
    });
    
    if (!response.data || response.data.success === false) {
      throw new Error('Failed to fetch price data from Birdeye');
    }
    
    // Extract price data
    const priceData = response.data.data;
    
    // Get SOL price in USD (also from Birdeye)
    const solResponse = await axios.get(process.env.BIRDEYE_API_URL, {
      params: {
        address: 'So11111111111111111111111111111111111111112', // SOL token address
        include_liquidity: false
      },
      headers: {
        'x-chain': 'solana',
        'X-API-KEY': process.env.BIRDEYE_API_KEY
      }
    });
    
    if (!solResponse.data || solResponse.data.success === false) {
      throw new Error('Failed to fetch SOL price data from Birdeye');
    }
    
    const solPriceInUsd = solResponse.data.data.value;
    
    // Calculate token price in SOL
    const tokenPriceInUsd = priceData.value;
    const tokenPriceInSol = tokenPriceInUsd / solPriceInUsd;
    
    // Update cache
    priceCache.tokenPriceInSol = tokenPriceInSol;
    priceCache.tokenPriceInUsd = tokenPriceInUsd;
    priceCache.solPriceInUsd = solPriceInUsd;
    priceCache.lastUpdated = Date.now();
    
    logger.info(`Updated token price: $${tokenPriceInUsd.toFixed(6)}, ${tokenPriceInSol.toFixed(8)} SOL`);
    
    return {
      tokenPriceInSol,
      tokenPriceInUsd,
      solPriceInUsd,
      liquidity: priceData.liquidity || null,
      volume24h: priceData.volume24h || null
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
 * Fetch token supply info using Helius API
 * @returns {Promise<Object>} Supply data
 */
const fetchTokenSupply = async () => {
  try {
    // Use getTokenSupply method via Helius connection
    const connection = getConnection(); // Assumes this uses the Helius endpoint
    const tokenMintAddress = new PublicKey(process.env.TOKEN_ADDRESS);
    
    // Get total supply from the mint
    const supplyInfo = await connection.getTokenSupply(tokenMintAddress);
    const totalSupply = supplyInfo.value.uiAmount;
    
    // Get tokens in burn address
    const burnAddressBalance = await getTokenBalance(process.env.BURN_ADDRESS);
    
    // Get tokens in reserve wallet
    const reserveWalletBalance = await getTokenBalance(process.env.RESERVE_WALLET_ADDRESS);
    
    // Calculate circulating supply
    const circulatingSupply = totalSupply - burnAddressBalance - reserveWalletBalance;
    
    logger.info(`Token supply info: Total=${totalSupply}, Circulating=${circulatingSupply}, Burned=${burnAddressBalance}, Reserve=${reserveWalletBalance}`);
    
    return {
      totalSupply,
      circulatingSupply,
      burnAddressBalance,
      reserveWalletBalance
    };
  } catch (error) {
    logger.error('Error fetching token supply from Helius:', error);
    
    // If we can't get on-chain data, fall back to the configured initial supply
    if (priceCache.circulatingSupply !== null) {
      logger.info('Using cached supply data due to fetch error');
      return {
        circulatingSupply: priceCache.circulatingSupply,
        isExpiredCache: true
      };
    }
    
    // Last resort fallback to initial supply configuration
    const initialSupply = Number(process.env.INITIAL_SUPPLY) || 1000000000;
    const reserveWalletPercentage = 0.3; // 30%
    
    return {
      totalSupply: initialSupply,
      circulatingSupply: initialSupply * (1 - reserveWalletPercentage),
      reserveWalletBalance: initialSupply * reserveWalletPercentage,
      burnAddressBalance: 0,
      isEstimated: true
    };
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
    
    // Fetch supply data from Helius
    const supplyData = await fetchTokenSupply();
    const circulatingSupply = supplyData.circulatingSupply;
    
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
 * Get comprehensive token metrics
 * @returns {Promise<Object>} Complete token metrics
 */
const getTokenMetrics = async () => {
  try {
    // Force refresh all data
    const [priceData, supplyData, marketCap] = await Promise.all([
      fetchTokenPrice(),
      fetchTokenSupply(),
      getMarketCap()
    ]);
    
    return {
      price: {
        usd: priceData.tokenPriceInUsd,
        sol: priceData.tokenPriceInSol,
        solPrice: priceData.solPriceInUsd,
        liquidity: priceData.liquidity,
        volume24h: priceData.volume24h
      },
      supply: {
        total: supplyData.totalSupply,
        circulating: supplyData.circulatingSupply,
        reserve: supplyData.reserveWalletBalance,
        burned: supplyData.burnAddressBalance
      },
      marketCap,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    logger.error('Error fetching token metrics:', error);
    throw error;
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
    
    // Get full metrics (forces refresh of all data)
    const metrics = await getTokenMetrics();
    
    // Update cache with all fresh data
    priceCache = {
      tokenPriceInSol: metrics.price.sol,
      tokenPriceInUsd: metrics.price.usd,
      solPriceInUsd: metrics.price.solPrice,
      marketCap: metrics.marketCap,
      circulatingSupply: metrics.supply.circulating,
      lastUpdated: Date.now(),
      ttl: priceCache.ttl
    };
    
    logger.info('Price cache refreshed successfully');
    return metrics;
  } catch (error) {
    logger.error('Error refreshing price cache:', error);
    throw error;
  }
};

module.exports = {
  fetchTokenPrice,
  fetchTokenSupply,
  getCirculatingSupply,
  getMarketCap,
  getTokenMetrics,
  refreshPriceCache
};