/**
 * Milestone-based burn configuration for $INFERNO token
 * This module defines the burn schedule based on market cap milestones
 */

const BURN_SCHEDULE = [
  { marketCap: 6000, burnAmount: 10000000, percentOfSupply: 1.00 },
  { marketCap: 6200, burnAmount: 10000000, percentOfSupply: 1.00 },
  { marketCap: 6500, burnAmount: 10000000, percentOfSupply: 1.00 },
  { marketCap: 7000, burnAmount: 15000000, percentOfSupply: 1.50 },
  { marketCap: 7500, burnAmount: 15000000, percentOfSupply: 1.50 },
  { marketCap: 8000, burnAmount: 20000000, percentOfSupply: 2.00 },
  { marketCap: 9000, burnAmount: 20000000, percentOfSupply: 2.00 },
  { marketCap: 10000, burnAmount: 25000000, percentOfSupply: 2.50 },
  { marketCap: 12000, burnAmount: 25000000, percentOfSupply: 2.50 }
];

// Calculate cumulative percentages for reference
const calculateCumulativePercentages = () => {
  let cumulativePercent = 0;
  return BURN_SCHEDULE.map(milestone => {
    cumulativePercent += milestone.percentOfSupply;
    return {
      ...milestone,
      cumulativePercent: parseFloat(cumulativePercent.toFixed(2))
    };
  });
};

const BURN_SCHEDULE_WITH_CUMULATIVE = calculateCumulativePercentages();

/**
 * Get the next pending milestone based on current market cap
 * @param {Number} currentMarketCap - Current market cap in USD
 * @param {Array} completedMilestones - Array of already completed milestone market caps
 * @returns {Object|null} The next milestone to be triggered, or null if all complete
 */
const getNextMilestone = (currentMarketCap, completedMilestones) => {
  // Convert to array if not already
  const completed = Array.isArray(completedMilestones) 
    ? completedMilestones 
    : (completedMilestones ? [completedMilestones] : []);
  
  // Find first milestone that is both:
  // 1. At or below the current market cap
  // 2. Not already completed
  for (const milestone of BURN_SCHEDULE) {
    if (currentMarketCap >= milestone.marketCap && 
        !completed.includes(milestone.marketCap)) {
      return milestone;
    }
  }
  
  return null;
};

/**
 * Get all milestones that should be triggered based on current market cap
 * @param {Number} currentMarketCap - Current market cap in USD
 * @param {Array} completedMilestones - Array of already completed milestone market caps
 * @returns {Array} Array of milestones that should be triggered
 */
const getPendingMilestones = (currentMarketCap, completedMilestones) => {
  // Convert to array if not already
  const completed = Array.isArray(completedMilestones) 
    ? completedMilestones 
    : (completedMilestones ? [completedMilestones] : []);
  
  return BURN_SCHEDULE.filter(milestone => 
    currentMarketCap >= milestone.marketCap && 
    !completed.includes(milestone.marketCap)
  );
};

/**
 * Calculate total tokens to be burned from a list of milestones
 * @param {Array} milestones - Array of milestone objects
 * @returns {Number} Total tokens to be burned
 */
const calculateTotalBurnAmount = (milestones) => {
  return milestones.reduce((total, milestone) => total + milestone.burnAmount, 0);
};

module.exports = {
  BURN_SCHEDULE,
  BURN_SCHEDULE_WITH_CUMULATIVE,
  getNextMilestone,
  getPendingMilestones,
  calculateTotalBurnAmount
};