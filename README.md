# $INFERNO Token Project

A deflationary token on the Solana blockchain with automatic buyback and milestone-based burns.

## Project Overview

$INFERNO combines two powerful deflationary mechanisms:

1. **Automatic Buyback & Burn**: Utilizing pump.fun's creator revenue sharing (0.05% of trading volume paid in SOL) to automatically buy back and burn tokens.
2. **Milestone-Based Burns**: A series of predetermined burns triggered at specific market cap thresholds, depleting a 30% reserve wallet by the time $100M market cap is reached.

## Token Specifications

- **Name**: $INFERNO
- **Network**: Solana
- **Initial Supply**: 1,000,000,000 (1 billion) tokens
- **Transaction Tax**: 0% (no tax on trades)
- **Reserve Wallet**: 30% of total supply (300 million tokens)
- **Creation Platform**: pump.fun
- **Burn Method**: Standard `1nc1nerator11111111111111111111111111111111` dead address with transaction memos

## Project Structure

```
/
├── src/
│   ├── scripts/
│   │   ├── buyback/      # Automatic buyback and burn script
│   │   ├── milestone/    # Milestone burn monitoring and execution
│   │   └── utils/        # Shared utilities (fileStorage, logger, solana)
│   ├── contracts/        # Solana program code (if needed)
│   └── backend/
│       └── api/          # API server for tracking burns
├── data/                 # JSON files for data storage
│   ├── burns.json        # Records of all token burns
│   ├── metrics.json      # Token metrics history
│   ├── milestones.json   # Milestone burn configuration and status
│   └── rewards.json      # Creator rewards and buyback records
├── public/               # Frontend static files
│   ├── css/              # Stylesheet files
│   ├── js/               # Frontend JavaScript
│   └── index.html        # Main HTML file
├── logs/                 # Log files
├── initialize.js         # Data initialization script
└── .env                  # Environment variables
```

## Components

### 1. Automated Buyback and Burn Script

Located in `src/scripts/buyback/`, this script:

- Monitors for SOL rewards from pump.fun's creator revenue sharing
- Claims rewards automatically when they exceed a minimum threshold
- Uses those rewards to buy back $INFERNO tokens on PumpSwap
- Burns the purchased tokens by sending them to a burn address
- Logs all transactions with amounts and timestamps

### 2. Market Cap Monitoring and Milestone Burn Script

Located in `src/scripts/milestone/`, this script:

- Monitors the current market cap of $INFERNO token
- Compares it against the predefined milestone thresholds
- When a threshold is reached, executes the corresponding burn transaction
- Updates state to track which milestones have been completed

### 3. Burn Verification and Tracking System

Located in `src/backend/api/` with data stored in JSON files in the `data/` directory, this system:

- Tracks all burn transactions (both from creator rewards and milestone burns)
- Calculates current circulating supply
- Stores historical burn data in JSON files for displaying on the website
- Provides API endpoints for the frontend to display this data
- Uses a file-based storage system (`fileStorage.js`) to manage persistence
- Provides real-time updates to the frontend when burns occur

## Milestone Burn Schedule

| Market Cap | Burn Amount  | % of Supply | Cumulative % |
|------------|--------------|-------------|--------------|
| $100K      | 50,000,000   | 5.00%       | 5.00%        |
| $200K      | 25,000,000   | 2.50%       | 7.50%        |
| $300K      | 20,000,000   | 2.00%       | 9.50%        |
| $500K      | 20,000,000   | 2.00%       | 11.50%       |
| $750K      | 15,000,000   | 1.50%       | 13.00%       |
| $1M        | 15,000,000   | 1.50%       | 14.50%       |
| $1.5M      | 12,500,000   | 1.25%       | 15.75%       |
| $2.5M      | 12,500,000   | 1.25%       | 17.00%       |
| $3.5M      | 10,000,000   | 1.00%       | 18.00%       |
| $5M        | 10,000,000   | 1.00%       | 19.00%       |
| $7.5M      | 10,000,000   | 1.00%       | 20.00%       |
| $10M       | 10,000,000   | 1.00%       | 21.00%       |
| $15M       | 7,500,000    | 0.75%       | 21.75%       |
| $25M       | 7,500,000    | 0.75%       | 22.50%       |
| $35M       | 5,000,000    | 0.50%       | 23.00%       |
| $50M       | 5,000,000    | 0.50%       | 23.50%       |
| $75M       | 7,500,000    | 0.75%       | 24.25%       |
| $90M       | 7,500,000    | 0.75%       | 25.00%       |
| $100M      | 50,000,000   | 5.00%       | 30.00%       |

This schedule features 5% burns at both the first and last milestones, with a progressive decline in between, and will consume the entire 30% reserve wallet by the time $100M market cap is reached.

## Installation

1. Clone this repository
2. Install dependencies:
   ```
   npm install
   ```
3. Copy the `.env.example` file to `.env` and fill in your configuration values
4. Run the initialization script to set up data storage files:
   ```
   npm run init
   ```

## Usage

### Starting the Buyback Script

```
npm run buyback
```

### Starting the Milestone Monitoring Script

```
npm run milestone
```

### Starting the API Server

```
npm run start-api
```

## API Endpoints

- `GET /api/metrics` - Get current token metrics
- `GET /api/burns` - Get burn history with pagination
- `GET /api/milestones` - Get milestone status
- `GET /api/metrics/history` - Get metrics history for charts
- `GET /api/rewards` - Get buyback rewards history (authenticated)
- `POST /api/refresh-price` - Trigger manual refresh of price data (authenticated)

## Security

- Private keys are managed using environment variables
- API endpoints use API key authentication
- Proper error handling and validation throughout the codebase

## Requirements

- Node.js 14+
- Solana wallet with private key
- Helius RPC API key (for enhanced Solana data)
- Birdeye API key (for token price data)

## Helius Integration

This project is optimized for use with Helius, a high-performance Solana RPC provider:

### Key Helius Features Used:

1. **Enhanced RPC Endpoint**: Higher reliability and performance for all Solana interactions
2. **Enhanced Transaction Data**: More detailed transaction information for burns and transfers
3. **Webhooks**: Event-driven architecture for real-time milestone and burn monitoring
4. **Rate Limit Handling**: Smart retry mechanisms with exponential backoff
5. **Solana Token Extensions**: Better token supply and account tracking

### Setting Up Helius:

1. Sign up at [helius.xyz](https://helius.xyz)
2. Create an API key
3. Set up webhooks for your token address and burn address
4. Configure the `.env` file with your Helius credentials

### Webhook Configuration:

The system supports Helius webhooks for real-time event processing. To set up:

1. Create a webhook in Helius dashboard pointing to `your-api-url/api/webhook/token-activity`
2. Add your token address, burn address, and reserve wallet as watched addresses
3. Set webhook type to "enhanced"
4. Configure for TOKEN_TRANSFER and MARKET_DATA_UPDATE events

For more details, visit the API endpoint: `/api/webhooks/setup` (requires authentication)

## License

MIT