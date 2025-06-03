/**
 * Milestone burn configuration for $INFERNO token
 * Contains the burn schedule and helper functions for milestone management
 */

// Milestone burn schedule 
const BURN_SCHEDULE = [
  { marketCap: 100000, burnAmount: 25000000, percentOfSupply: 2.50 },
  { marketCap: 150000, burnAmount: 25000000, percentOfSupply: 2.50 },
  { marketCap: 200000, burnAmount: 20000000, percentOfSupply: 2.00 },
  { marketCap: 300000, burnAmount: 17500000, percentOfSupply: 1.75 },
  { marketCap: 500000, burnAmount: 17500000, percentOfSupply: 1.75 },
  { marketCap: 750000, burnAmount: 15000000, percentOfSupply: 1.50 },
  { marketCap: 1000000, burnAmount: 15000000, percentOfSupply: 1.50 },
  { marketCap: 1500000, burnAmount: 10000000, percentOfSupply: 1.00 },
  { marketCap: 2500000, burnAmount: 10000000, percentOfSupply: 1.00 },
  { marketCap: 3500000, burnAmount: 7500000, percentOfSupply: 0.75 },
  { marketCap: 5000000, burnAmount: 7500000, percentOfSupply: 0.75 },
  { marketCap: 7500000, burnAmount: 7500000, percentOfSupply: 0.75 },
  { marketCap: 10000000, burnAmount: 7500000, percentOfSupply: 0.75 },
  { marketCap: 15000000, burnAmount: 5000000, percentOfSupply: 0.50 },
  { marketCap: 25000000, burnAmount: 5000000, percentOfSupply: 0.50 },
  { marketCap: 35000000, burnAmount: 5000000, percentOfSupply: 0.50 },
  { marketCap: 50000000, burnAmount: 5000000, percentOfSupply: 0.50 },
  { marketCap: 75000000, burnAmount: 7500000, percentOfSupply: 0.75 },
  { marketCap: 90000000, burnAmount: 7500000, percentOfSupply: 0.75 },
  { marketCap: 100000000, burnAmount: 30000000, percentOfSupply: 3.00 }
];

/**
 * Get the next milestone that hasn't been completed yet
 * @param {Number} currentMarketCap - Current market cap in USD
 * @param {Array} milestones - Array of milestone objects from storage
 * @returns {Object|null} Next milestone or null if all completed
 */
const getNextMilestone = (currentMarketCap, milestones) => {
  if (!milestones || milestones.length === 0) return null;
  
  // Sort by market cap ascending and find first incomplete
  return milestones
    .sort((a, b) => a.marketCap - b.marketCap)
    .find(m => !m.completed);
};

/**
 * Get all pending milestones (reached but not completed)
 * @param {Number} currentMarketCap - Current market cap in USD
 * @param {Array} milestones - Array of milestone objects from storage
 * @returns {Array} Pending milestones
 */
const getPendingMilestones = (currentMarketCap, milestones) => {
  if (!milestones || milestones.length === 0) return [];
  
  return milestones
    .filter(m => !m.completed && currentMarketCap >= m.marketCap)
    .sort((a, b) => a.marketCap - b.marketCap);
};

module.exports = {
  BURN_SCHEDULE,
  getNextMilestone,
  getPendingMilestones
};