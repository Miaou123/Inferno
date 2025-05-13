const mongoose = require('mongoose');

// Burns Schema - Track all burn transactions
const BurnSchema = new mongoose.Schema({
  burnType: {
    type: String,
    enum: ['buyback', 'milestone'],
    required: true,
    index: true,
  },
  amount: {
    type: Number,
    required: true,
  },
  txSignature: {
    type: String,
    required: true,
    unique: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true,
  },
  initiator: {
    type: String,
    required: true,
  },
  marketCapAtBurn: {
    type: Number,
  },
  milestone: {
    type: Number,
  },
  solUsed: {
    type: Number,
  },
  pricePerToken: {
    type: Number,
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
  }
});

// Token Metrics Schema - Track token metrics over time
const MetricsSchema = new mongoose.Schema({
  timestamp: {
    type: Date,
    default: Date.now,
    index: true,
  },
  totalSupply: {
    type: Number,
    required: true,
  },
  circulatingSupply: {
    type: Number,
    required: true,
  },
  reserveWalletBalance: {
    type: Number,
    required: true,
  },
  priceInSol: {
    type: Number,
  },
  priceInUsd: {
    type: Number,
  },
  marketCap: {
    type: Number,
  },
  totalBurned: {
    type: Number,
    required: true,
  },
  buybackBurned: {
    type: Number,
    required: true,
  },
  milestoneBurned: {
    type: Number,
    required: true,
  }
});

// Milestone Tracking Schema - Track milestone burn completions
const MilestoneSchema = new mongoose.Schema({
  marketCap: {
    type: Number,
    required: true,
    unique: true,
  },
  burnAmount: {
    type: Number,
    required: true,
  },
  percentOfSupply: {
    type: Number,
    required: true,
  },
  completed: {
    type: Boolean,
    default: false,
    index: true,
  },
  txSignature: {
    type: String,
  },
  completedAt: {
    type: Date,
  },
  burnId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Burns',
  }
});

// Rewards Schema - Track creator rewards and buybacks
const RewardsSchema = new mongoose.Schema({
  timestamp: {
    type: Date,
    default: Date.now,
    index: true,
  },
  solAmount: {
    type: Number,
    required: true,
  },
  claimTxSignature: {
    type: String,
  },
  tokensBought: {
    type: Number,
  },
  buyTxSignature: {
    type: String,
  },
  tokensBurned: {
    type: Number,
  },
  burnTxSignature: {
    type: String,
  },
  status: {
    type: String,
    enum: ['pending', 'claimed', 'bought', 'burned', 'failed'],
    default: 'pending',
    index: true,
  },
  errorMessage: {
    type: String,
  }
});

// Create and export models
const Burns = mongoose.model('Burns', BurnSchema);
const Metrics = mongoose.model('Metrics', MetricsSchema);
const Milestones = mongoose.model('Milestones', MilestoneSchema);
const Rewards = mongoose.model('Rewards', RewardsSchema);

module.exports = {
  Burns,
  Metrics,
  Milestones,
  Rewards
};