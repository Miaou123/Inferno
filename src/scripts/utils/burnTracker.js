// src/scripts/utils/burnTracker.js
const fileStorage = require('./fileStorage');
const logger = require('./logger');

/**
 * Simple burn tracking utility
 */
const burnTracker = {
  /**
   * Record a new burn transaction
   * @param {Object} burnData - Burn transaction data
   * @param {Number} burnData.burnAmount - Amount of tokens burned
   * @param {String} burnData.burnType - Type of burn ('milestone' or 'automated')
   * @param {String} burnData.transactionHash - Transaction hash
   * @param {Number} burnData.solSpent - Amount of SOL spent (for automated burns)
   * @param {Number} burnData.burnAmountUsd - USD value of burned tokens
   * @returns {Object} Saved burn record
   */
  recordBurn: (burnData) => {
    try {
      logger.debug(`[BurnTracker] Recording new burn transaction: ${JSON.stringify(burnData)}`);
      
      // Ensure required fields
      if (!burnData.burnAmount) {
        logger.error('[BurnTracker] Missing burnAmount in burn data');
        throw new Error('Burn amount is required');
      }
      
      // Create burn record with timestamp
      const burnRecord = {
        ...burnData,
        timestamp: burnData.timestamp || new Date().toISOString(),
        id: burnData.id || `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
      };
      
      logger.debug(`[BurnTracker] Created burn record: ${JSON.stringify(burnRecord)}`);
      
      // Save to storage
      const savedBurn = fileStorage.saveRecord('burns', burnRecord);
      logger.info(`[BurnTracker] Recorded burn of ${burnData.burnAmount.toLocaleString()} tokens (${burnData.burnType})`);
      
      // Update metrics with new burn data
      burnTracker.updateMetricsWithBurn(burnData);
      
      return savedBurn;
    } catch (error) {
      logger.error(`[BurnTracker] Error recording burn: ${error.message}`);
      throw error;
    }
  },
  
  /**
   * Get total burned amount
   * @returns {Number} Total burned amount
   */
  getTotalBurned: () => {
    try {
      logger.debug('[BurnTracker] Getting total burned amount');
      
      const burns = fileStorage.readData(fileStorage.FILES.burns);
      logger.debug(`[BurnTracker] Found ${burns.length} burn records`);
      
      const totalBurned = burns.reduce((total, burn) => {
        const amount = burn.burnAmount || 0;
        logger.debug(`[BurnTracker] Adding burn: ${amount} (${burn.burnType || 'unknown type'})`);
        return total + amount;
      }, 0);
      
      logger.debug(`[BurnTracker] Total burned: ${totalBurned.toLocaleString()} tokens`);
      return totalBurned;
    } catch (error) {
      logger.error(`[BurnTracker] Error getting total burned: ${error.message}`);
      return 0;
    }
  },
  
  /**
   * Get burn data separated by type
   * @returns {Object} Burn data by type
   */
  getBurnsByType: () => {
    try {
      logger.debug('[BurnTracker] Getting burns by type');
      
      const burns = fileStorage.readData(fileStorage.FILES.burns);
      logger.debug(`[BurnTracker] Processing ${burns.length} burn records`);
      
      // Calculate amounts by burn type
      const automated = burns
        .filter(burn => burn.burnType === 'automated' || burn.burnType === 'buyback')
        .reduce((total, burn) => {
          logger.debug(`[BurnTracker] Adding automated burn: ${burn.burnAmount || 0} tokens (${burn.burnType})`);
          return total + (burn.burnAmount || 0);
        }, 0);
        
      const milestone = burns
        .filter(burn => burn.burnType === 'milestone')
        .reduce((total, burn) => {
          logger.debug(`[BurnTracker] Adding milestone burn: ${burn.burnAmount || 0} tokens`);
          return total + (burn.burnAmount || 0);
        }, 0);
      
      const totalBurned = automated + milestone;
      
      logger.debug(`[BurnTracker] Burn totals: 
        - Automated: ${automated.toLocaleString()} tokens
        - Milestone: ${milestone.toLocaleString()} tokens
        - Total: ${totalBurned.toLocaleString()} tokens`);
      
      return {
        total: totalBurned,
        automated,
        milestone
      };
    } catch (error) {
      logger.error(`[BurnTracker] Error getting burns by type: ${error.message}`);
      return { total: 0, automated: 0, milestone: 0 };
    }
  },
  
  /**
   * Get count of burns by type
   * @returns {Object} Count of burns by type
   */
  getBurnCountByType: () => {
    try {
      logger.debug('[BurnTracker] Getting burn count by type');
      
      const burns = fileStorage.readData(fileStorage.FILES.burns);
      
      // Count by type
      const counts = {
        automated: 0,
        buyback: 0,
        milestone: 0,
        total: burns.length
      };
      
      burns.forEach(burn => {
        const type = burn.burnType || 'unknown';
        if (type === 'automated' || type === 'buyback') {
          counts.automated++;
          logger.debug(`[BurnTracker] Counted automated burn: ${burn.id}`);
        } else if (type === 'milestone') {
          counts.milestone++;
          logger.debug(`[BurnTracker] Counted milestone burn: ${burn.id}`);
        }
      });
      
      logger.debug(`[BurnTracker] Burn counts:
        - Automated: ${counts.automated}
        - Milestone: ${counts.milestone}
        - Total: ${counts.total}`);
      
      return counts;
    } catch (error) {
      logger.error(`[BurnTracker] Error getting burn count: ${error.message}`);
      return { automated: 0, milestone: 0, total: 0 };
    }
  },
  
  /**
   * Get recent burns for display
   * @param {Number} limit - Maximum number of burns to return
   * @returns {Array} Recent burns
   */
  getRecentBurns: (limit = 5) => {
    try {
      logger.debug(`[BurnTracker] Getting recent burns (limit: ${limit})`);
      
      const burns = fileStorage.readData(fileStorage.FILES.burns);
      
      // Sort by timestamp (descending) and limit
      const recentBurns = [...burns]
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, limit);
      
      logger.debug(`[BurnTracker] Retrieved ${recentBurns.length} recent burns`);
      
      // Log each burn
      recentBurns.forEach((burn, index) => {
        logger.debug(`[BurnTracker] Recent burn #${index + 1}: ${burn.burnAmount.toLocaleString()} tokens (${burn.burnType}) on ${burn.timestamp}`);
      });
      
      return recentBurns;
    } catch (error) {
      logger.error(`[BurnTracker] Error getting recent burns: ${error.message}`);
      return [];
    }
  },
  
  /**
   * Get burns in the last 24 hours
   * @returns {Number} Total burned in last 24 hours
   */
  getBurnsLast24Hours: () => {
    try {
      logger.debug('[BurnTracker] Calculating burns in last 24 hours');
      
      const burns = fileStorage.readData(fileStorage.FILES.burns);
      const oneDayAgo = new Date();
      oneDayAgo.setHours(oneDayAgo.getHours() - 24);
      
      logger.debug(`[BurnTracker] Timeframe: after ${oneDayAgo.toISOString()}`);
      
      const burns24h = burns
        .filter(burn => {
          const burnDate = new Date(burn.timestamp);
          const isRecent = burnDate >= oneDayAgo;
          logger.debug(`[BurnTracker] Burn ${burn.id} (${burn.timestamp}): ${isRecent ? 'within' : 'outside'} 24h window`);
          return isRecent;
        })
        .reduce((total, burn) => {
          logger.debug(`[BurnTracker] Adding recent burn: ${burn.burnAmount || 0} tokens`);
          return total + (burn.burnAmount || 0);
        }, 0);
      
      logger.debug(`[BurnTracker] Total burned in last 24 hours: ${burns24h.toLocaleString()} tokens`);
      return burns24h;
    } catch (error) {
      logger.error(`[BurnTracker] Error calculating 24h burns: ${error.message}`);
      return 0;
    }
  },

  /**
   * Get total milestone burns
   * @returns {Number} Total milestone burns
   */
  getTotalMilestoneBurns: () => {
    try {
      logger.debug('[BurnTracker] Getting total milestone burns');
      
      const burns = fileStorage.readData(fileStorage.FILES.burns);
      logger.debug(`[BurnTracker] Found ${burns.length} burn records to analyze for milestone burns`);
      
      // Filter and sum milestone burns
      const milestoneBurns = burns
        .filter(burn => burn.burnType === 'milestone')
        .reduce((total, burn) => {
          logger.debug(`[BurnTracker] Adding milestone burn: ${burn.burnAmount || 0} tokens (ID: ${burn.id})`);
          return total + (burn.burnAmount || 0);
        }, 0);
      
      logger.debug(`[BurnTracker] Total milestone burns: ${milestoneBurns.toLocaleString()} tokens`);
      return milestoneBurns;
    } catch (error) {
      logger.error(`[BurnTracker] Error getting total milestone burns: ${error.message}`);
      return 0;
    }
  },
  
  /**
   * Get completed milestone data
   * @returns {Object} Milestone data
   */
  getMilestoneData: () => {
    try {
      logger.debug('[BurnTracker] Getting milestone data');
      
      // Get milestones
      const milestones = fileStorage.readData(fileStorage.FILES.milestones);
      const completedMilestones = milestones.filter(m => m.completed);
      
      logger.debug(`[BurnTracker] Found ${completedMilestones.length} completed milestones out of ${milestones.length} total`);
      
      // Get milestone burns for double checking
      const milestoneBurns = fileStorage.readData(fileStorage.FILES.burns)
        .filter(burn => burn.burnType === 'milestone');
      
      // Calculate total burned from milestones
      const totalBurnedFromMilestones = completedMilestones.reduce((total, milestone) => {
        return total + (milestone.burnAmount || 0);
      }, 0);
      
      // Alternative calculation from burn records
      const totalBurnedFromRecords = milestoneBurns.reduce((total, burn) => {
        return total + (burn.burnAmount || 0);
      }, 0);
      
      logger.debug(`[BurnTracker] Milestone burn calculations:
        - From milestones: ${totalBurnedFromMilestones.toLocaleString()} tokens
        - From burn records: ${totalBurnedFromRecords.toLocaleString()} tokens
        - Using: ${Math.max(totalBurnedFromMilestones, totalBurnedFromRecords).toLocaleString()} tokens`);
      
      // Use the larger value to be safe
      const totalMilestoneBurned = Math.max(totalBurnedFromMilestones, totalBurnedFromRecords);
      
      // Calculate percentage of supply
      const initialSupply = Number(process.env.INITIAL_SUPPLY) || 1000000000;
      const burnPercentage = (totalMilestoneBurned / initialSupply) * 100;
      
      // Find next milestone to complete
      const nextMilestone = milestones.find(m => !m.completed);
      
      return {
        completedCount: completedMilestones.length,
        totalCount: milestones.length,
        totalBurned: totalMilestoneBurned,
        burnPercentage: parseFloat(burnPercentage.toFixed(2)),
        nextMilestone
      };
    } catch (error) {
      logger.error(`[BurnTracker] Error getting milestone data: ${error.message}`);
      return {
        completedCount: 0,
        totalCount: 0,
        totalBurned: 0,
        burnPercentage: 0,
        nextMilestone: null
      };
    }
  },
  
  /**
   * Update metrics with new burn data
   * @param {Object} burnData - Burn data
   */
  updateMetricsWithBurn: (burnData) => {
    try {
      logger.debug(`[BurnTracker] Updating metrics with burn: ${JSON.stringify(burnData)}`);
      
      // Get latest metrics
      const metrics = fileStorage.findRecords('metrics', () => true, { 
        sort: { field: 'timestamp', order: 'desc' }, 
        limit: 1 
      });
      
      logger.debug(`[BurnTracker] Found ${metrics.length} existing metrics records`);
      
      // If no metrics exist, create initial metrics
      if (metrics.length === 0) {
        logger.debug('[BurnTracker] No existing metrics, creating initial metrics');
        
        const initialSupply = Number(process.env.INITIAL_SUPPLY) || 1000000000;
        logger.debug(`[BurnTracker] Using initial supply: ${initialSupply.toLocaleString()}`);
        
        const newMetrics = {
          timestamp: new Date().toISOString(),
          totalSupply: initialSupply,
          circulatingSupply: initialSupply - burnData.burnAmount,
          totalBurned: burnData.burnAmount,
          buybackBurned: burnData.burnType === 'automated' || burnData.burnType === 'buyback' ? burnData.burnAmount : 0,
          milestoneBurned: burnData.burnType === 'milestone' ? burnData.burnAmount : 0
        };
        
        logger.debug(`[BurnTracker] Created initial metrics: ${JSON.stringify(newMetrics)}`);
        
        fileStorage.saveRecord('metrics', newMetrics);
        return;
      }
      
      // Update existing metrics
      const latestMetrics = metrics[0];
      logger.debug(`[BurnTracker] Latest metrics: ${JSON.stringify(latestMetrics)}`);
      
      // Create new metrics entry
      const newMetrics = {
        timestamp: new Date().toISOString(),
        totalSupply: latestMetrics.totalSupply,
        circulatingSupply: latestMetrics.circulatingSupply - burnData.burnAmount,
        totalBurned: (latestMetrics.totalBurned || 0) + burnData.burnAmount,
        buybackBurned: (latestMetrics.buybackBurned || 0) + 
          (burnData.burnType === 'automated' || burnData.burnType === 'buyback' ? burnData.burnAmount : 0),
        milestoneBurned: (latestMetrics.milestoneBurned || 0) + 
          (burnData.burnType === 'milestone' ? burnData.burnAmount : 0)
      };
      
      logger.debug(`[BurnTracker] Updated metrics:
        - Previous totalBurned: ${latestMetrics.totalBurned || 0}
        - New totalBurned: ${newMetrics.totalBurned}
        - Previous circulatingSupply: ${latestMetrics.circulatingSupply}
        - New circulatingSupply: ${newMetrics.circulatingSupply}
        - Burn amount: ${burnData.burnAmount} (${burnData.burnType})`);
      
      fileStorage.saveRecord('metrics', newMetrics);
      logger.info(`[BurnTracker] Metrics updated successfully after ${burnData.burnAmount.toLocaleString()} token burn`);
    } catch (error) {
      logger.error(`[BurnTracker] Error updating metrics with burn: ${error.message}`, error);
    }
  },
  
  /**
   * Calculate burn percentage relative to initial supply
   * @returns {Number} Burn percentage
   */
  getBurnPercentage: () => {
    try {
      logger.debug('[BurnTracker] Calculating burn percentage');
      
      const totalBurned = burnTracker.getTotalBurned();
      const initialSupply = Number(process.env.INITIAL_SUPPLY) || 1000000000;
      
      const percentage = (totalBurned / initialSupply) * 100;
      logger.debug(`[BurnTracker] Burn percentage: ${percentage.toFixed(2)}% (${totalBurned.toLocaleString()} / ${initialSupply.toLocaleString()})`);
      
      return percentage;
    } catch (error) {
      logger.error(`[BurnTracker] Error calculating burn percentage: ${error.message}`);
      return 0;
    }
  },
  
  /**
   * Get complete burn stats for frontend display
   * @returns {Object} Comprehensive burn statistics
   */
  getBurnStats: () => {
    try {
      logger.debug('[BurnTracker] Getting comprehensive burn stats');
      
      const totalBurned = burnTracker.getTotalBurned();
      const burnsByType = burnTracker.getBurnsByType();
      const burnCounts = burnTracker.getBurnCountByType();
      const burns24h = burnTracker.getBurnsLast24Hours();
      const recentBurns = burnTracker.getRecentBurns(5);
      const milestoneData = burnTracker.getMilestoneData();
      
      const initialSupply = Number(process.env.INITIAL_SUPPLY) || 1000000000;
      const burnPercentage = (totalBurned / initialSupply) * 100;
      
      const stats = {
        totalBurned,
        burnsByType,
        burnCounts,
        burns24h,
        recentBurns,
        initialSupply,
        currentSupply: initialSupply - totalBurned,
        burnPercentage,
        milestoneData,
        timestamp: new Date().toISOString()
      };
      
      logger.debug(`[BurnTracker] Complete burn stats:
        - Total burned: ${totalBurned.toLocaleString()} tokens (${burnPercentage.toFixed(2)}%)
        - Automated: ${burnsByType.automated.toLocaleString()} tokens
        - Milestone: ${burnsByType.milestone.toLocaleString()} tokens
        - Current supply: ${stats.currentSupply.toLocaleString()} tokens
        - 24h burn: ${burns24h.toLocaleString()} tokens
        - Burn counts: ${burnCounts.total} total (${burnCounts.automated} automated, ${burnCounts.milestone} milestone)
        - Milestone completed: ${milestoneData.completedCount} of ${milestoneData.totalCount}`);
      
      return stats;
    } catch (error) {
      logger.error(`[BurnTracker] Error getting comprehensive burn stats: ${error.message}`);
      return {
        totalBurned: 0,
        burnsByType: { total: 0, automated: 0, milestone: 0 },
        burnCounts: { total: 0, automated: 0, milestone: 0 },
        burns24h: 0,
        recentBurns: [],
        initialSupply: 1000000000,
        currentSupply: 1000000000,
        burnPercentage: 0,
        milestoneData: {
          completedCount: 0,
          totalCount: 0,
          totalBurned: 0,
          burnPercentage: 0
        },
        timestamp: new Date().toISOString()
      };
    }
  }
};

module.exports = burnTracker;