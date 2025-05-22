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

app.get('/api/creator-address', (req, res) => {
  const creatorAddress = process.env.CREATOR_ADDRESS || "coming soon";
  return res.json({ 
    creatorAddress, 
    success: true 
  });
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
  // Get token address from environment variable
  const tokenAddress = process.env.TOKEN_ADDRESS || "coming soon";
  
  return res.json({ 
    tokenAddress, 
    success: true 
  });
});

// Ajoutez ceci à votre server.js
app.get('/api/debug', (req, res) => {
  // Lecture directe du fichier burns.json
  const fs = require('fs');
  const path = require('path');
  const burnsPath = path.join(__dirname, '../../../data/burns.json');
  
  try {
    const data = fs.readFileSync(burnsPath, 'utf8');
    const burns = JSON.parse(data);
    
    res.json({
      success: true,
      message: 'Lecture directe de burns.json',
      filePath: burnsPath,
      burnsCount: burns.length,
      firstBurn: burns[0],
      secondBurn: burns[1],
      allBurns: burns
    });
  } catch (error) {
    res.json({
      success: false,
      error: error.message,
      filePath: burnsPath
    });
  }
});

// Modifiez votre endpoint /api/burns pour plus de clarté
app.get('/api/burns', async (req, res) => {
  try {
    
    // Désactivation forcée du cache
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // Lecture directe du fichier burns.json (pour déboguer)
    const fs = require('fs');
    const directPath = require('path').join(__dirname, '../../../data/burns.json');
    
    let directData = [];
    try {
      if (fs.existsSync(directPath)) {
        const rawData = fs.readFileSync(directPath, 'utf8');
        directData = JSON.parse(rawData);
        if (directData.length > 0) {
        }
      } else {
      }
    } catch (directError) {
      console.error(`Erreur en lecture directe: ${directError.message}`);
    }
    
    // Lecture via fileStorage (méthode normale)
    const allBurns = fileStorage.readData(fileStorage.FILES.burns);
    
    if (allBurns.length === 0) {
      // Si aucune brûlure n'est trouvée, utilisons les données directes
      
      const response = {
        burns: directData,
        pagination: {
          total: directData.length,
          page: 1,
          limit: directData.length,
          pages: 1
        }
      };
      
      return res.json(response);
    }
  
    
    // Tri, filtrage et pagination comme avant
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const burnType = req.query.type;
    
    const filterFn = burnType ? burn => burn.burnType === burnType : () => true;
    const sortedBurns = [...allBurns].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const filteredBurns = sortedBurns.filter(filterFn);
    const paginatedBurns = filteredBurns.slice(skip, skip + limit);
  
    
    const response = {
      burns: paginatedBurns,
      pagination: {
        total: filteredBurns.length,
        page,
        limit,
        pages: Math.ceil(filteredBurns.length / limit)
      }
    };
    
    return res.json(response);
  } catch (error) {
    console.error(`Erreur /api/burns: ${error.message}`);
    return res.status(500).json({ 
      error: 'Error in getting the burns',
      message: error.message
    });
  }
});

// Updated /api/milestones endpoint in server.js
app.get('/api/milestones', async (req, res) => {
  try {
    // Get all milestones
    const milestones = fileStorage.readData(fileStorage.FILES.milestones);
    milestones.sort((a, b) => a.marketCap - b.marketCap);
    
    // Get current market cap
    const currentMarketCap = await getMarketCap();
    
    // Get milestone stats directly from burnTracker
    const milestoneData = burnTracker.getMilestoneData();
    
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
    
    // Calculate progress towards next milestone if there is one
    let nextMilestoneProgress = 0;
    if (nextMilestone) {
      nextMilestoneProgress = Math.min(Math.round((currentMarketCap / nextMilestone.marketCap) * 100), 99);
    }
    
    // Get total burned milestone data from burns directly
    const milestoneBurns = fileStorage.readData(fileStorage.FILES.burns)
      .filter(burn => burn.burnType === 'milestone');
    
    const totalMilestoneBurned = milestoneBurns.reduce((sum, burn) => sum + (burn.burnAmount || 0), 0);
    
    // Calculate percentage of supply burned via milestones
    const initialSupply = Number(process.env.INITIAL_SUPPLY) || 1000000000;
    const milestoneBurnPercentage = (totalMilestoneBurned / initialSupply) * 100;
    
    // Create response object with all required data
    const responseData = {
      milestones: enhancedMilestones,
      currentMarketCap,
      totalMilestoneBurned,
      burnPercentage: milestoneBurnPercentage.toFixed(2),
      completedMilestones: milestoneData.completedCount,
      totalMilestones: milestoneData.totalCount,
      progress: {
        completedCount: milestoneData.completedCount,
        totalCount: milestoneData.totalCount,
        nextMilestone,
        nextMilestoneProgress
      }
    };
    
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
