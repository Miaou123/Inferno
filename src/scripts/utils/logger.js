/**
 * Logger utility for $INFERNO token
 */
const winston = require('winston');
const fs = require('fs');
const path = require('path');

// Ensure logs directory exists
const logDir = path.join(__dirname, '../../../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Configure logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'inferno-token' },
  transports: [
    // Write all logs error (and below) to error.log
    new winston.transports.File({ 
      filename: path.join(logDir, 'error.log'), 
      level: 'error' 
    }),
    // Write all logs to combined.log
    new winston.transports.File({ 
      filename: path.join(logDir, 'combined.log') 
    })
  ]
});

// Always add the console transport regardless of environment
logger.add(new winston.transports.Console({
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.simple()
  )
}));

// Add specialized loggers for different components
logger.buyback = logger.child({ component: 'buyback' });
logger.milestone = logger.child({ component: 'milestone' });
logger.api = logger.child({ component: 'api' });
logger.price = logger.child({ component: 'price-oracle' });
logger.rewards = logger.child({ component: 'rewards' });
logger.tokenCreation = logger.child({ component: 'token-creation' });
logger.setup = logger.child({ component: 'setup' });
logger.recovery = logger.child({ component: 'recovery' });

module.exports = logger;