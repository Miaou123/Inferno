/**
 * Backend API Server for $INFERNO token
 * Provides endpoints for tracking burns, metrics, and milestone progress
 * Uses file-based storage instead of MongoDB
 */
const express = require('express');
const path = require('path');
const { getMarketCap, getCirculatingSupply, fetchTokenPrice } = require('../../scripts/utils/priceOracle');
const logger = require('../../scripts/utils/logger').api;
const fileStorage = require('../../scripts/utils/fileStorage');
require('dotenv').config();

// Initialize Express app
const app = express();
app.use(express.json());

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, '../../../public')));

// API authentication middleware
const authenticate = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey || apiKey !== process.env.API_SECRET_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  next();
};

// Initialize storage
const initializeServer = async () => {
  try {
    // Initialize file storage
    fileStorage.initializeStorage();
    
    // Start the server
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
    });
  } catch (error) {
    logger.error(`Error initializing server: ${error}`);
    process.exit(1);
  }
};

// Define API routes

// Get current token metrics
app.get('/api/metrics', async (req, res) => {
  try {
    // Get latest metrics from storage
    const metrics = fileStorage.findRecords('metrics', () => true, { 
      sort: { field: 'timestamp', order: 'desc' }, 
      limit: 1 
    });
    
    const latestMetrics = metrics[0];
    
    // If no metrics found, fetch current values
    if (!latestMetrics) {
      const [marketCap, circulatingSupply, priceData] = await Promise.all([
        getMarketCap(),
        getCirculatingSupply(),
        fetchTokenPrice()
      ]);
      
      const initialSupply = Number(process.env.INITIAL_SUPPLY) || 1000000000;
      
      return res.json({
        totalSupply: initialSupply,
        circulatingSupply,
        reserveWalletBalance: initialSupply * 0.3,
        totalBurned: 0,
        buybackBurned: 0,
        milestoneBurned: 0,
        priceInSol: priceData.tokenPriceInSol,
        priceInUsd: priceData.tokenPriceInUsd,
        marketCap,
        lastUpdated: new Date().toISOString()
      });
    }
    
    // Return the metrics
    res.json({
      ...latestMetrics,
      lastUpdated: latestMetrics.timestamp
    });
  } catch (error) {
    logger.error(`Error fetching metrics: ${error}`);
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

// Get burn history with pagination
app.get('/api/burns', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const burnType = req.query.type; // Optional filter by burn type
    
    // Build filter function
    const filterFn = burnType ? burn => burn.burnType === burnType : () => true;
    
    // Get burns with pagination
    const burns = fileStorage.findRecords('burns', filterFn, {
      sort: { field: 'timestamp', order: 'desc' },
      skip,
      limit
    });
    
    // Get total count for pagination
    const total = fileStorage.countRecords('burns', filterFn);
    
    res.json({
      burns,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error(`Error fetching burns: ${error}`);
    res.status(500).json({ error: 'Failed to fetch burn history' });
  }
});

// Get milestone status
app.get('/api/milestones', async (req, res) => {
  try {
    // Get all milestones
    const milestones = fileStorage.readData(fileStorage.FILES.milestones);
    milestones.sort((a, b) => a.marketCap - b.marketCap);
    
    // Get current market cap
    const currentMarketCap = await getMarketCap();
    
    // Enhance with progress information
    const enhancedMilestones = milestones.map(milestone => {
      const isEligible = currentMarketCap >= milestone.marketCap;
      const isPending = isEligible && !milestone.completed;
      
      return {
        ...milestone,
        isEligible,
        isPending,
        currentMarketCap
      };
    });
    
    // Find next milestone
    const nextMilestone = enhancedMilestones.find(m => !m.completed);
    
    res.json({
      milestones: enhancedMilestones,
      currentMarketCap,
      progress: {
        completedCount: milestones.filter(m => m.completed).length,
        totalCount: milestones.length,
        nextMilestone
      }
    });
  } catch (error) {
    logger.error(`Error fetching milestones: ${error}`);
    res.status(500).json({ error: 'Failed to fetch milestone status' });
  }
});

// Get metrics history with pagination (for charts)
app.get('/api/metrics/history', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 24; // Default to 24 data points
    const skip = (page - 1) * limit;
    
    // Get metrics with pagination
    const metrics = fileStorage.findRecords('metrics', () => true, {
      sort: { field: 'timestamp', order: 'desc' },
      skip,
      limit
    });
    
    // Get total count for pagination
    const total = fileStorage.countRecords('metrics');
    
    // Reverse for chronological order
    const chronologicalMetrics = [...metrics].reverse();
    
    res.json({
      metrics: chronologicalMetrics,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error(`Error fetching metrics history: ${error}`);
    res.status(500).json({ error: 'Failed to fetch metrics history' });
  }
});

// Get buyback rewards history
app.get('/api/rewards', authenticate, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    // Get rewards with pagination
    const rewards = fileStorage.findRecords('rewards', () => true, {
      sort: { field: 'timestamp', order: 'desc' },
      skip,
      limit
    });
    
    // Get total count for pagination
    const total = fileStorage.countRecords('rewards');
    
    res.json({
      rewards,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error(`Error fetching rewards: ${error}`);
    res.status(500).json({ error: 'Failed to fetch rewards history' });
  }
});

// Trigger manual refresh of price data (admin only)
app.post('/api/refresh-price', authenticate, async (req, res) => {
  try {
    const { refreshPriceCache } = require('../../scripts/utils/priceOracle');
    const priceData = await refreshPriceCache();
    
    res.json({
      success: true,
      priceData
    });
  } catch (error) {
    logger.error(`Error refreshing price data: ${error}`);
    res.status(500).json({ error: 'Failed to refresh price data' });
  }
});

// Handle API 404s differently from website routes
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// Serve index.html for all other routes to support SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../../../public/index.html'));
});

// Handle errors
app.use((err, req, res, next) => {
  logger.error(`Unhandled error: ${err}`);
  res.status(500).json({ error: 'Internal server error' });
});

// Handle graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully');
  process.exit(0);
});

// Start the server if this file is run directly
if (require.main === module) {
  initializeServer();
}

module.exports = app;