/**
 * Simplified Check Rewards utility for $INFERNO token using pAMMBay
 * This version just re-exports from claimRewards to avoid circular dependency
 */
const { checkAvailableRewards } = require('./claimRewards');

module.exports = {
  checkAvailableRewards
};