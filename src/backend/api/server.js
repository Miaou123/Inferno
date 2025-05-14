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
const burnTracker = require('../../scripts/utils/burnTracker');
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

// Simple API endpoint for burn calculation
app.get('/api/calculate-burn', async (req, res) => {
  try {
    // Get total supply from env
    const initialSupply = Number(process.env.INITIAL_SUPPLY) || 1000000000;
    
    // Get total burned amount directly from burnTracker
    const burnedAmount = burnTracker.getTotalBurned();
    
    // Calculate circulating supply
    const circulatingSupply = initialSupply - burnedAmount;
    
    // Calculate burn percentage
    const burnPercentage = (burnedAmount / initialSupply * 100).toFixed(2);
    
    res.json({
      initialSupply,
      circulatingSupply,
      burnAmount: burnedAmount,
      burnPercentage: parseFloat(burnPercentage),
      success: true
    });
  } catch (error) {
    console.error("Error in burn calculation endpoint:", error);
    res.status(500).json({
      error: "Failed to calculate burn amount",
      success: false
    });
  }
});

app.get('/api/metrics', async (req, res) => {
  try {
    // Get latest metrics from storage
    const metrics = fileStorage.findRecords('metrics', () => true, { 
      sort: { field: 'timestamp', order: 'desc' }, 
      limit: 1 
    });
    
    const latestMetrics = metrics[0];
    
    // Calculer le market cap
    const marketCap = await getMarketCap();
    
    // Obtenir les données de burn
    const burns = fileStorage.readData(fileStorage.FILES.burns);
    const totalBurned = burns.reduce((sum, burn) => sum + (burn.burnAmount || 0), 0);
    
    // Obtenir les milestones complétés
    const milestones = fileStorage.readData(fileStorage.FILES.milestones);
    const completedMilestones = milestones.filter(m => m.completed).length;
    
    // Log toutes les valeurs importantes
    console.log("============ VALEURS DU SITE ============");
    console.log(`Market Cap: $${marketCap.toLocaleString()}`);
    console.log(`Total Burned: ${totalBurned.toLocaleString()} tokens`);
    console.log(`Burn Percentage: ${((totalBurned / 1000000000) * 100).toFixed(2)}%`);
    console.log(`Completed Milestones: ${completedMilestones} of ${milestones.length}`);
    
    // Log des différentes collections
    console.log(`Nombre total de burns: ${burns.length}`);
    console.log(`Nombre total de metrics: ${metrics.length}`);
    console.log(`Nombre total de milestones: ${milestones.length}`);
    
    // Construire la réponse
    const responseData = {
      marketCap: marketCap,
      totalBurned: totalBurned,
      burnPercentage: ((totalBurned / 1000000000) * 100).toFixed(2),
      completedMilestones: completedMilestones,
      totalMilestones: milestones.length
    };
    
    if (latestMetrics) {
      responseData.metrics = latestMetrics;
    }
    
    // Log de la réponse complète
    console.log("============ RÉPONSE API ============");
    console.log(JSON.stringify(responseData, null, 2));
    
    res.json({
      success: true,
      ...responseData
    });
  } catch (error) {
    console.error(`Error fetching metrics: ${error}`);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch metrics' 
    });
  }
});

// Note: This endpoint is deprecated - using burnTracker.getTotalBurned() is the preferred method
app.get('/api/simple-burn', async (req, res) => {
  try {
    // Get total supply from env
    const initialSupply = Number(process.env.INITIAL_SUPPLY) || 1000000000;
    
    // Get total burned from burnTracker
    const totalBurned = burnTracker.getTotalBurned();
    
    // Calculate circulating supply
    const circulatingSupply = initialSupply - totalBurned;
    
    // Calculate percentage
    const burnPercentage = (totalBurned / initialSupply * 100).toFixed(2);
    
    console.log("Simple burn calculation from burnTracker:");
    console.log("- Initial Supply:", initialSupply);
    console.log("- Circulating Supply:", circulatingSupply);
    console.log("- Burn Amount:", totalBurned);
    console.log("- Burn Percentage:", burnPercentage + "%");
    
    res.json({
      initialSupply,
      circulatingSupply,
      burnAmount: totalBurned,
      burnPercentage: parseFloat(burnPercentage),
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

// Endpoint to update metrics based on burn records
app.get('/api/update-metrics', async (req, res) => {
  try {
    // Get total burned amount and burns by type from burnTracker
    const totalBurned = burnTracker.getTotalBurned();
    const burnsByType = burnTracker.getBurnsByType();
    
    // Get initial supply
    const initialSupply = Number(process.env.INITIAL_SUPPLY) || 1000000000;
    
    // Calculate circulating supply
    const circulatingSupply = initialSupply - totalBurned;
    
    // Create updated metrics
    const updatedMetrics = {
      timestamp: new Date().toISOString(),
      totalSupply: initialSupply,
      circulatingSupply: circulatingSupply,
      totalBurned: totalBurned,
      buybackBurned: burnsByType.automated,
      milestoneBurned: burnsByType.milestone
    };
    
    // Save the updated metrics
    fileStorage.saveRecord('metrics', updatedMetrics);
    
    res.json({
      success: true,
      message: 'Metrics updated from burn records',
      metrics: updatedMetrics
    });
  } catch (error) {
    console.error('Error updating metrics:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update metrics',
      message: error.message
    });
  }
});

// Add a dedicated endpoint for burn statistics by type
// Ajouter ceci à src/backend/api/server.js

// Endpoint pour les statistiques complètes de burn
app.get('/api/burn-stats', (req, res) => {
  try {
    logger.debug('[API] Fetching comprehensive burn stats');
    
    // Obtenir les statistiques complètes
    const stats = burnTracker.getBurnStats();
    
    // Ajouter des données de contexte pour le débogage
    const debugContext = {
      env: {
        TOKEN_ADDRESS: process.env.TOKEN_ADDRESS,
        INITIAL_SUPPLY: process.env.INITIAL_SUPPLY,
        NODE_ENV: process.env.NODE_ENV
      },
      storageStatus: {
        burns: fileStorage.readData(fileStorage.FILES.burns).length,
        metrics: fileStorage.readData(fileStorage.FILES.metrics).length,
        milestones: fileStorage.readData(fileStorage.FILES.milestones).length
      },
      timestamp: new Date().toISOString()
    };
    
    logger.debug(`[API] Burn stats context: ${JSON.stringify(debugContext)}`);
    
    res.json({
      success: true,
      burnStats: stats,
      debug: debugContext
    });
  } catch (error) {
    logger.error(`[API] Error getting burn stats: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Failed to get burn stats',
      errorDetails: error.message
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
// Get milestone status
app.get('/api/milestones', async (req, res) => {
  try {
    console.log("==== API DEBUG: /api/milestones ====");
    // Get all milestones
    const milestones = fileStorage.readData(fileStorage.FILES.milestones);
    console.log(`Found ${milestones.length} milestones in storage`);
    milestones.sort((a, b) => a.marketCap - b.marketCap);
    
    // Get current market cap
    const currentMarketCap = await getMarketCap();
    console.log(`Current market cap: ${currentMarketCap}`);
    
    // Calculate burn totals
    const completedMilestones = milestones.filter(m => m.completed);
    console.log(`Completed milestones: ${completedMilestones.length}`);
    
    const totalMilestoneBurned = completedMilestones.reduce((sum, m) => sum + (m.burnAmount || 0), 0);
    console.log(`Total milestone burned: ${totalMilestoneBurned.toLocaleString()} tokens`);
    
    // Enhance with progress information
    const enhancedMilestones = milestones.map(milestone => {
      const isEligible = currentMarketCap >= milestone.marketCap;
      const isPending = isEligible && !milestone.completed;
      
      return {
        ...milestone,
        isEligible,
        isPending
      };
    });
    
    // Find next milestone
    const nextMilestone = enhancedMilestones.find(m => !m.completed);
    console.log("Next milestone:", nextMilestone ? nextMilestone.marketCap : "none");
    
    // Create response object with all required data
    const responseData = {
      milestones: enhancedMilestones,
      currentMarketCap,
      totalMilestoneBurned,
      burnPercentage: ((totalMilestoneBurned / 1000000000) * 100).toFixed(2),
      progress: {
        completedCount: completedMilestones.length,
        totalCount: milestones.length,
        nextMilestone
      }
    };
    
    console.log("Sending milestone response data");
    res.json(responseData);
  } catch (error) {
    console.error(`Error fetching milestones: ${error}`);
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