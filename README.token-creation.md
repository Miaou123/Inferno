# $INFERNO Token Creation Guide

This document explains how to manually create the $INFERNO token using the provided tooling.

## Prerequisites

Before creating the token, ensure you have:

1. **Solana Wallet**: A wallet with sufficient SOL for:
   - Token creation fees (~0.01 SOL)
   - Initial liquidity (1+ SOL recommended) 
   - Reserve allocation buy (5+ SOL recommended)

2. **API Keys**:
   - Helius API key for enhanced Solana RPC access

## Setup Process

### 1. Configure Environment

First, set up your environment variables:

```bash
# Copy the example environment file
cp .env.example .env

# Edit the file and fill in your details
nano .env
```

Required fields:
- `SOLANA_PRIVATE_KEY`: Your wallet's private key
- `HELIUS_API_KEY`: Your Helius API key
- `BURN_ADDRESS`: Keep the default value unless you want a custom burn address
- Make sure `UPDATE_ENV=true` to automatically update your .env after creation

### 2. Initialize Data Files

Run the initialization script to create necessary data files:

```bash
npm run init
```

This creates the basic data structure for tracking burns, milestones, metrics, and rewards.

### 3. Create the Token

When you're ready to create the actual token, run:

```bash
npm run create-token
```

This will:
- Create a new $INFERNO token on pump.fun
- Make an initial creator buy to establish liquidity
- Make a larger reserve allocation buy with the same wallet
- Store the token address in your data files
- Update your `.env` file with the new token address

### 4. Start the Protocol

Once the token is created, you can start the protocol components:

```bash
# Start individual components
npm run buyback     # Start buyback monitoring
npm run milestone   # Start milestone monitoring
npm run rewards     # Start rewards claiming
npm run start-api   # Start the API server

# Or start everything at once
npm run start
```

## Important Notes

1. **Manual Trigger**: Token creation is designed to be manually triggered. You only need to run `npm run create-token` once.

2. **Verification**: After creation, verify your token on:
   - Solscan: `https://solscan.io/token/{YOUR_TOKEN_ADDRESS}`
   - pump.fun: `https://pump.fun/token/{YOUR_TOKEN_ADDRESS}`

3. **Separation of Concerns**: 
   - Token creation is a one-time process
   - The ongoing protocol (buyback, milestone monitoring, rewards) runs separately
   - All components will automatically use the token address from your .env file

4. **Storage**: Your token's details, including the mint private key, are stored in the data files. Back these up securely.

## Troubleshooting

If token creation fails:
- Check your wallet balance has sufficient SOL
- Verify your Helius API key is valid
- Check the logs in the terminal and in the `logs/` directory
- If needed, you can retry the creation process

If you've already created a token and just need to update your .env:
1. Set `TOKEN_ADDRESS=your_token_address` in your .env file
2. Run `npm run init` to initialize data files
3. Start the protocol components