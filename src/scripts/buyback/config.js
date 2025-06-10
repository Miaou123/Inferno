/**
 * Configuration for pAMMBay buyback system
 */
require('dotenv').config();

// Validate required environment variables
const requiredEnvVars = [
  'CREATOR_VAULT',
  'CREATOR_ADDRESS', 
  'TOKEN_ADDRESS',
  'BURN_ADDRESS'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
  throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
}

module.exports = {
  // pAMMBay creator vault configuration from environment
  vaultAddress: process.env.CREATOR_VAULT,
  authorityAddress: process.env.CREATOR_ADDRESS,
  poolAddress: process.env.CREATOR_POOL,
  
  // Reward thresholds
  rewardThreshold: parseFloat(process.env.REWARDS_CLAIM_THRESHOLD) || 0.5,
  maxSlippage: parseFloat(process.env.MAX_SLIPPAGE_PERCENT) || 10,
  checkIntervalMinutes: parseInt(process.env.BUYBACK_INTERVAL_MINUTES) || 15,
  
  // Transaction settings
  computeUnits: 100000,
  computeUnitPrice: 100000,
  
  // Safety buffers
  buybackSafetyBuffer: 0.95, // Use 95% of SOL for buyback
  burnSafetyBuffer: 0.99     // Use 99% of bought tokens for burn
};