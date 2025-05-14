# $INFERNO Token Setup Guide

This document provides instructions for setting up and launching the $INFERNO token on the Solana blockchain using pump.fun.

## Prerequisites

Before setting up the token, make sure you have:

1. A Solana wallet with sufficient SOL for:
   - Token creation fees (typically around 0.01 SOL)
   - Initial liquidity (1+ SOL recommended)
   - Reserve allocation purchase (5+ SOL recommended)

2. API keys for:
   - Helius (for enhanced Solana data)
   - Birdeye (for token price data)

## Environment Setup

1. Copy the example environment file:
   ```
   cp .env.example .env
   ```

2. Edit the `.env` file and fill in the following required values:
   ```
   # Solana Configuration
   SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=your_helius_api_key_here
   SOLANA_PRIVATE_KEY=your_private_key_here
   SOLANA_PUBLIC_KEY=your_public_key_here

   # Helius Configuration
   HELIUS_API_KEY=your_helius_api_key_here

   # Token Configuration
   INITIAL_SUPPLY=1000000000  # Default is 1 billion tokens
   ```

3. Install dependencies:
   ```
   npm install
   ```

## Launch Process

The setup process consists of the following steps:

1. **Token Creation**: Creates a new token on pump.fun with the $INFERNO branding and metadata
2. **Initial Buy**: Makes an initial buy to establish liquidity
3. **Reserve Allocation**: Buys tokens for the reserve allocation (30% of total supply)
4. **Data Initialization**: Sets up the burn schedule and metrics tracking

To start the setup process:

```
npm run setup
```

This will:
- Create the token on pump.fun
- Perform the initial buys
- Initialize all data files
- Update your `.env` file with the new token address
- Output the token address and setup details

## Post-Launch Steps

After successfully creating the token, start the monitoring scripts:

1. Start the buyback monitoring:
   ```
   npm run buyback
   ```

2. Start the milestone monitoring:
   ```
   npm run milestone
   ```

3. Start the rewards claim service:
   ```
   npm run rewards
   ```

4. Start the API server:
   ```
   npm run start-api
   ```

Or run everything at once:
```
npm run start
```

## Verification

To verify the token was created successfully:

1. Check the console output for the token address
2. Visit `https://solscan.io/token/{TOKEN_ADDRESS}` to view your token on Solana explorer
3. Visit `https://pump.fun/token/{TOKEN_ADDRESS}` to view your token on pump.fun

## Troubleshooting

If the setup process fails:

1. Check the logs in the `logs/` directory for detailed error messages
2. Ensure your wallet has sufficient SOL for all operations
3. Verify your API keys are valid and have the necessary permissions
4. If the process fails after token creation but before completing all steps, you can manually update your `.env` file with the token address and re-run the remaining scripts

## Security Notes

- The token's mint private key is saved in the setup details. This should be backed up securely and not shared.
- Your wallet private key is only used for signing transactions and is never stored or transmitted beyond the initial setup.