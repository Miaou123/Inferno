/**
 * Backend API Server for $INFERNO token
 * Provides endpoints for tracking burns, metrics, and milestone progress
 * Uses file-based storage instead of MongoDB
 * Integrates with Helius for enhanced Solana data and webhooks
 */
const express = require('express');
const path = require('path');
const { getMarketCap, getCirculatingSupply, fetchTokenPrice, getTokenMetrics } = require('../../scripts/utils/priceOracle');
const { checkMilestones } = require('../../scripts/milestone');
const logger = require('../../scripts/utils/logger').api;
const fileStorage = require('../../scripts/utils/fileStorage');
const { calculateBurnAmount } = require('../../scripts/utils/calculateBurnAmount');
require('dotenv').config();

// Initialize Express app
const app = express();
app.use(express.json({ limit: '1mb' }));

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, '../../../public')));

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

app.get('/api/calculate-burn', async (req, res) => {
  try {
    const burnData = await calculateBurnAmount();
    
    if (burnData.success) {
      res.json(burnData);
    } else {
      res.status(500).json({
        error: burnData.error,
        success: false
      });
    }
  } catch (error) {
    console.error("Error in burn calculation endpoint:", error);
    res.status(500).json({
      error: "Failed to calculate burn amount",
      success: false
    });
  }
});

// Define API routes
app.get('/api/metrics', async (req, res) => {
  try {
    // Get latest metrics from storage
    const metrics = fileStorage.findRecords('metrics', () => true, { 
      sort: { field: 'timestamp', order: 'desc' }, 
      limit: 1 
    });
    
    const latestMetrics = metrics[0];
    console.log("Latest metrics from storage:", latestMetrics);
    
    // Get burn records
    const burns = fileStorage.readData(fileStorage.FILES.burns);
    const totalBurnedFromRecords = burns.reduce((sum, burn) => sum + (burn.burnAmount || 0), 0);
    
    console.log("Total burned from records:", totalBurnedFromRecords);
    
    // Ensure we have some valid metrics
    if (!latestMetrics || latestMetrics.totalBurned === 0 && totalBurnedFromRecords > 0) {
      // Try to get up-to-date on-chain data
      try {
        const { updateMetricsFromChain } = require('../../scripts/utils/priceOracle');
        const updatedMetrics = await updateMetricsFromChain();
        
        return res.json({
          ...updatedMetrics,
          tokenAddress: process.env.TOKEN_ADDRESS,
          lastUpdated: updatedMetrics.timestamp
        });
      } catch (chainError) {
        console.log("Couldn't get chain data, using fallback calculation");
        
        // Fallback calculation based on burn records
        const initialSupply = Number(process.env.INITIAL_SUPPLY) || 1000000000;
        
        return res.json({
          totalSupply: initialSupply,
          circulatingSupply: initialSupply - totalBurnedFromRecords,
          reserveWalletBalance: 0, // No reserve if we're using fallback
          totalBurned: totalBurnedFromRecords,
          buybackBurned: burns.filter(b => b.burnType === 'automated' || b.burnType === 'buyback')
                          .reduce((sum, b) => sum + (b.burnAmount || 0), 0),
          milestoneBurned: burns.filter(b => b.burnType === 'milestone')
                            .reduce((sum, b) => sum + (b.burnAmount || 0), 0),
          tokenAddress: process.env.TOKEN_ADDRESS,
          lastUpdated: new Date().toISOString(),
          calculationMethod: "burn_records_fallback"
        });
      }
    }
    
    // Return metrics, ensuring totalBurned is properly set
    const responseMetrics = {
      ...latestMetrics,
      totalBurned: Math.max(latestMetrics.totalBurned || 0, totalBurnedFromRecords),
      tokenAddress: process.env.TOKEN_ADDRESS,
      lastUpdated: latestMetrics.timestamp
    };
    
    console.log("Sending metrics with totalBurned:", responseMetrics.totalBurned);
    res.json(responseMetrics);
  } catch (error) {
    logger.error(`Error fetching metrics: ${error}`);
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

pp.get('/api/simple-burn', async (req, res) => {
  try {
    // Hardcoded initial supply
    const initialSupply = 1000000000;
    
    // Use the circulating supply you provided
    const circulatingSupply = 891610397.89;
    
    // Calculate burn amount
    const burnAmount = initialSupply - circulatingSupply;
    
    // Calculate percentage
    const burnPercentage = (burnAmount / initialSupply * 100).toFixed(2);
    
    console.log("Simple burn calculation:");
    console.log("- Initial Supply:", initialSupply);
    console.log("- Circulating Supply:", circulatingSupply);
    console.log("- Burn Amount:", burnAmount);
    console.log("- Burn Percentage:", burnPercentage + "%");
    
    res.json({
      initialSupply,
      circulatingSupply,
      burnAmount,
      burnPercentage,
      success: true
    });
  } catch (error) {
    console.error("Error in simple burn calculation:", error);
    res.status(500).json({ 
      error: "Failed to calculate burn", 
      success: false 
    });
  }
});

// Add an endpoint to update metrics from the blockchain
app.get('/api/update-metrics', async (req, res) => {
  try {
    // Import the functions
    const { updateMetricsFromChain } = require('../../scripts/utils/priceOracle');
    
    // Get the updated metrics
    const updatedMetrics = await updateMetricsFromChain();
    
    res.json({
      success: true,
      message: 'Metrics updated from blockchain data',
      metrics: updatedMetrics
    });
  } catch (error) {
    console.error('Error updating metrics from chain:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update metrics from chain',
      message: error.message
    });
  }
});

// Add a dedicated endpoint for burn statistics
app.get('/api/burn-stats', (req, res) => {
  try {
    // Get initial supply from env
    const initialSupply = Number(process.env.INITIAL_SUPPLY) || 1000000000;
    
    // Get latest metrics from storage
    const metrics = fileStorage.findRecords('metrics', () => true, { 
      sort: { field: 'timestamp', order: 'desc' }, 
      limit: 1 
    });
    
    // Get burns from storage
    const burns = fileStorage.readData(fileStorage.FILES.burns);
    
    // Calculate total burned from burns collection
    const burnedFromRecords = burns.reduce((total, burn) => total + (burn.burnAmount || 0), 0);
    
    // Get circulating supply from metrics or calculate
    const circulatingSupply = metrics[0]?.circulatingSupply || (initialSupply - burnedFromRecords);
    
    // Calculate burned amount (two ways)
    const burnedFromSupply = initialSupply - circulatingSupply;
    
    console.log("Burn stats calculation:");
    console.log("- Initial Supply:", initialSupply);
    console.log("- Circulating Supply:", circulatingSupply);
    console.log("- Burned (from supply):", burnedFromSupply);
    console.log("- Burned (from records):", burnedFromRecords);
    
    return res.json({
      initialSupply,
      circulatingSupply,
      totalBurned: burnedFromSupply,
      totalBurnedFromRecords: burnedFromRecords,
      burnPercentage: (burnedFromSupply / initialSupply * 100).toFixed(2),
      success: true
    });
  } catch (error) {
    console.error("Error getting burn stats:", error);
    return res.status(500).json({
      error: "Failed to calculate burn statistics",
      success: false
    });
  }
});

app.get('/api/token-address', (req, res) => {
  // Override the environment variable directly
  const tokenAddress = "HJ2n2a3YK1LTBCRbS932cTtmXw4puhgG8Jb2WcpEpump";
  
  return res.json({ 
    tokenAddress, 
    success: true 
  });
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
app.get('/api/rewards', async (req, res) => {
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

// Trigger manual refresh of price data
app.post('/api/refresh-price', async (req, res) => {
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