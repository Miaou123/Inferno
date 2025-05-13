# $INFERNO Token Project - Installation Guide

This guide will walk you through the process of setting up and running the $INFERNO token project components.

## Prerequisites

Before you begin, make sure you have the following installed:

- Node.js (v14 or higher)
- npm (v6 or higher)
- Solana CLI tools (optional, for interacting with Solana directly)

Note: This project uses local JSON files for data storage. No database setup is required. All data is stored in JSON files in the `data/` directory.

## Installation Steps

### 1. Clone the repository

```bash
git clone <repository-url>
cd inferno-token
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Copy the example environment file and update it with your own values:

```bash
cp .env.example .env
```

Edit the `.env` file and fill in the following required values:

- `SOLANA_RPC_URL`: URL for your Solana RPC node
- `SOLANA_PRIVATE_KEY`: Private key for your wallet (JSON array format)
- `SOLANA_PUBLIC_KEY`: Public key for your wallet
- `TOKEN_ADDRESS`: Mint address of your $INFERNO token
- `BURN_ADDRESS`: Address to send tokens to for burning
- `RESERVE_WALLET_PRIVATE_KEY`: Private key for the reserve wallet
- `RESERVE_WALLET_ADDRESS`: Address of the reserve wallet

### 4. Initialize the data storage

Run the initialization script to set up the data files:

```bash
npm run init
```

This will:
1. Create the necessary JSON data files in the `data/` directory
2. Populate the milestone data with the predefined burn schedule
3. Set up empty arrays for burns, metrics, and rewards data

The file structure created will be:
```
data/
├── burns.json     # Records of all token burns
├── metrics.json   # Token metrics history
├── milestones.json # Milestone burn configuration and status
└── rewards.json   # Creator rewards and buyback records
```

Each file will be initialized with the proper data structure for the application to use.

## Running the Components

The project consists of three main components that can be run separately or together.

### Run all components together

```bash
npm run start-all
```

This will start the buyback script, milestone monitoring script, and API server concurrently.

### Run components individually

#### 1. Buyback Script

This script monitors creator rewards, executes buybacks, and burns tokens automatically:

```bash
npm run buyback
```

#### 2. Milestone Monitoring Script

This script monitors the market cap and executes milestone burns when thresholds are reached:

```bash
npm run milestone
```

#### 3. API Server

This server provides endpoints for tracking burns, metrics, and milestone progress:

```bash
npm run start-api
```

For development with auto-restart:

```bash
npm run dev-api
```

### Run test script

To test the core components without executing any actual burns:

```bash
npm run test-run
```

## API Endpoints

Once the API server is running, you can access the following endpoints:

- `GET http://localhost:3000/api/metrics` - Get current token metrics
  - Returns: `{ price, marketCap, circulatingSupply, totalSupply, totalBurned, lastUpdated }`

- `GET http://localhost:3000/api/burns` - Get burn history
  - Returns: Array of `{ id, timestamp, amount, txid, type, solAmount }` objects
  - Types include: `'buyback'` and `'milestone'`

- `GET http://localhost:3000/api/milestones` - Get milestone status
  - Returns: Array of milestones with their completion status
  - Each milestone: `{ marketCap, burnAmount, percentOfSupply, completed, burnTxId, burnDate }`

- `GET http://localhost:3000/api/metrics/history` - Get metrics history for charts
  - Returns: Array of `{ timestamp, price, marketCap, circulatingSupply, totalBurned }` objects
  - Data is sorted by timestamp (newest first)
  - Use query parameter `?days=7` to limit history (defaults to 30 days)

## Monitoring and Logs

Logs are stored in the `logs/` directory:

- `combined.log` - Contains all logs
- `error.log` - Contains only error logs

## Troubleshooting

### Data Storage System

The system stores all data in JSON files within the `data/` directory:
- `milestones.json` - Contains milestone configuration and completion status
- `burns.json` - Records all burn transactions
- `metrics.json` - Tracks token metrics over time
- `rewards.json` - Records creator rewards and buyback transactions

Each JSON file contains an array of records with timestamps and unique IDs.

### Data storage issues

If you encounter data storage issues, ensure:
- The `data` directory exists and is writable
- JSON files in the data directory are valid JSON arrays
- The process has permission to read/write to the data directory
- Files are not corrupted (they should contain valid JSON arrays)

### Solana connection issues

If you encounter Solana connection issues, ensure:
- Your SOLANA_RPC_URL in `.env` is valid and accessible
- Your private key is in the correct format (JSON array)
- Your wallet has enough SOL for transaction fees

### API server not starting

If the API server fails to start, check:
- The port is not already in use
- The data directory exists and is readable
- Node.js version is compatible

## Production Deployment

For production deployment, consider:

1. Using a process manager like PM2:
   ```bash
   npm install -g pm2
   pm2 start initialize.js --name "inferno-init"
   pm2 start src/scripts/buyback/index.js --name "inferno-buyback"
   pm2 start src/scripts/milestone/index.js --name "inferno-milestone"
   pm2 start src/backend/api/server.js --name "inferno-api"
   ```

2. Setting up monitoring and alerts
3. Using proper backup for JSON data files
4. Adding HTTPS for the API server using a reverse proxy like Nginx
5. Implementing rate limiting and additional security measures