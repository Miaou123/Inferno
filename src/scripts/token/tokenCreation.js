/**
 * Token Creation Module for $INFERNO
 * Creates the token directly on pump.fun and handles initial creator buy
 */
const fs = require('fs/promises');
const { Blob } = require('buffer');
const { 
  Keypair, 
  Connection, 
  PublicKey, 
  SystemProgram, 
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction
} = require('@solana/web3.js');
const { Token, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const FormData = require('form-data');
const bs58 = require('bs58');
const fetch = require('node-fetch');
const logger = require('../utils/logger');
const fileStorage = require('../utils/fileStorage');
const { getConnection, createKeypair } = require('../utils/solana');
require('dotenv').config();

// Add this polyfill for fs.openAsBlob if needed
if (!fs.openAsBlob) {
  fs.openAsBlob = async (path) => {
    const buffer = await fs.readFile(path);
    return new Blob([buffer]);
  };
}

/**
 * Upload token metadata to IPFS via pump.fun
 * @param {Object} tokenData - Token metadata
 * @returns {Promise<String>} IPFS metadata URI
 */
async function uploadTokenMetadata(tokenData) {
  try {
    logger.info('Uploading token metadata to IPFS');
    
    // Create form data for IPFS upload
    const formData = new FormData();
    formData.append("file", await fs.openAsBlob(tokenData.imageFile));
    formData.append("name", tokenData.name);
    formData.append("symbol", tokenData.symbol);
    formData.append("description", tokenData.description);
    formData.append("twitter", tokenData.twitter);
    formData.append("telegram", tokenData.telegram);
    formData.append("website", tokenData.website);
    formData.append("showName", "true");
    
    // Upload to pump.fun's IPFS endpoint
    const response = await fetch("https://pump.fun/api/ipfs", {
      method: "POST",
      body: formData,
      headers: {
        'Origin': 'https://pump.fun',
        'Referer': 'https://pump.fun/'
      }
    });
    
    if (!response.ok) {
      throw new Error(`IPFS upload failed: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    logger.info(`Metadata uploaded to IPFS: ${data.metadataUri}`);
    
    return data.metadataUri;
  } catch (error) {
    logger.error(`Error uploading metadata: ${error}`);
    throw error;
  }
}

/**
 * Create $INFERNO token directly on pump.fun
 * @param {Object} options - Token creation options
 * @returns {Promise<Object>} Creation result
 */
async function createInfernoToken(options = {}) {
  try {
    logger.info('Starting $INFERNO token creation process');
    
    // Generate a random keypair for token or use provided one
    const mintKeypair = options.mintKeypair || Keypair.generate();
    logger.info(`Token mint address: ${mintKeypair.publicKey.toString()}`);
    
    // Define default token metadata
    const defaultMetadata = {
      name: "$INFERNO",
      symbol: "INFERNO",
      description: "A deflationary token with automatic buyback and milestone-based burns",
      twitter: "https://twitter.com/inferno_token",
      telegram: "https://t.me/inferno_token",
      website: "https://inferno.token",
      imageFile: "./public/images/logo.png",
      initialBuyAmount: 0.1 // SOL
    };
    
    // Merge with provided options
    const tokenData = { ...defaultMetadata, ...options };
    
    // 1. Upload metadata to IPFS
    const metadataUri = await uploadTokenMetadata(tokenData);
    
    // Get required keypairs and connection
    const walletKeypair = createKeypair(process.env.SOLANA_PRIVATE_KEY);
    const connection = getConnection();
    
    // Define pump.fun program ID
    const PUMP_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
    
    // 2. Request transaction from pump.fun for token creation
    logger.info('Fetching transaction data from pump.fun API');
    
    const createTokenResponse = await fetch("https://frontend-api-v3.pump.fun/tokens/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Origin": "https://pump.fun",
        "Referer": "https://pump.fun/"
      },
      body: JSON.stringify({
        creator: walletKeypair.publicKey.toString(),
        mint: mintKeypair.publicKey.toString(),
        name: tokenData.name,
        symbol: tokenData.symbol,
        metadataUri: metadataUri,
        buyAmount: tokenData.initialBuyAmount * 1e9, // Convert SOL to lamports
      })
    });
    
    if (!createTokenResponse.ok) {
      throw new Error(`Token creation request failed: ${createTokenResponse.status} ${createTokenResponse.statusText}`);
    }
    
    const createTokenData = await createTokenResponse.json();
    
    // 3. Sign and send the transaction
    logger.info('Signing and sending token creation transaction');
    
    // Parse the serialized transaction
    const serializedTx = Buffer.from(createTokenData.serializedTx, 'base64');
    const transaction = Transaction.from(serializedTx);
    
    // Add signatures (mint keypair and wallet keypair)
    transaction.sign(walletKeypair, mintKeypair);
    
    // Send the transaction
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [walletKeypair, mintKeypair],
      {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
        commitment: 'confirmed',
      }
    );
    
    logger.info(`Token created successfully! Transaction: https://solscan.io/tx/${signature}`);
    
    // Save token creation details to storage
    const tokenDetails = {
      name: tokenData.name,
      symbol: tokenData.symbol,
      address: mintKeypair.publicKey.toString(),
      metadataUri: metadataUri,
      creationTxSignature: signature,
      initialBuyAmount: tokenData.initialBuyAmount,
      createdAt: new Date().toISOString()
    };
    
    fileStorage.saveRecord('tokenDetails', tokenDetails);
    
    return {
      success: true,
      tokenDetails,
      signature,
      mintPrivateKey: bs58.encode(mintKeypair.secretKey)
    };
  } catch (error) {
    logger.error(`Error creating token: ${error}`);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Buy tokens directly on pump.fun
 * @param {String} tokenAddress - Token mint address
 * @param {String} privateKey - Private key of the wallet
 * @param {Number} solAmount - Amount of SOL to use for buying tokens
 * @param {String} buyType - Type of buy (e.g., 'reserve-allocation', 'personal-buy')
 * @returns {Promise<Object>} Buy result
 */
async function buyTokens(tokenAddress, privateKey, solAmount, buyType = 'personal-buy') {
  try {
    logger.info(`Buying ${solAmount} SOL worth of ${tokenAddress}`);
    
    // Create keypair from private key
    const keypair = createKeypair(privateKey);
    const connection = getConnection();
    
    // Define pump.fun program ID
    const PUMP_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
    
    // Request buy transaction from pump.fun
    const buyResponse = await fetch("https://frontend-api-v3.pump.fun/swap", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Origin": "https://pump.fun",
        "Referer": "https://pump.fun/"
      },
      body: JSON.stringify({
        owner: keypair.publicKey.toString(),
        inputMint: "So11111111111111111111111111111111111111112", // SOL
        outputMint: tokenAddress,
        amount: solAmount * 1e9, // Convert SOL to lamports
        slippage: 1000, // 10%
      })
    });
    
    if (!buyResponse.ok) {
      throw new Error(`Buy request failed: ${buyResponse.status} ${buyResponse.statusText}`);
    }
    
    const buyData = await buyResponse.json();
    
    // Parse the serialized transaction
    const serializedTx = Buffer.from(buyData.serializedTx, 'base64');
    const transaction = Transaction.from(serializedTx);
    
    // Sign the transaction
    transaction.sign(keypair);
    
    // Send the transaction
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [keypair],
      {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
        commitment: 'confirmed',
      }
    );
    
    logger.info(`Tokens bought successfully! Transaction: https://solscan.io/tx/${signature}`);
    
    // Save buy details to storage
    const buyDetails = {
      tokenAddress,
      solAmount,
      txSignature: signature,
      wallet: keypair.publicKey.toString(),
      type: buyType,
      timestamp: new Date().toISOString()
    };
    
    fileStorage.saveRecord('tokenBuys', buyDetails);
    
    return {
      success: true,
      buyDetails,
      signature
    };
  } catch (error) {
    logger.error(`Error buying tokens: ${error}`);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Buy reserve allocation with reserve wallet
 * @param {String} tokenAddress - Token mint address 
 * @param {Number} solAmount - Amount of SOL to use for buying tokens
 * @returns {Promise<Object>} Buy result
 */
async function buyReserveAllocation(tokenAddress, solAmount) {
  return buyTokens(
    tokenAddress,
    process.env.RESERVE_WALLET_PRIVATE_KEY,
    solAmount,
    'reserve-allocation'
  );
}

/**
 * Set up the complete token creation and initial allocation
 * @returns {Promise<Object>} Setup result
 */
async function setupInfernoToken() {
  try {
    logger.info('Starting $INFERNO token setup');
    
    // Initialize storage
    fileStorage.initializeStorage();
    
    // Step 1: Create the token
    const creationResult = await createInfernoToken({
      initialBuyAmount: 0.1 // Initial 0.1 SOL buy from creator
    });
    
    if (!creationResult.success) {
      throw new Error(`Token creation failed: ${creationResult.error}`);
    }
    
    const tokenAddress = creationResult.tokenDetails.address;
    
    // Step 2: Buy reserve allocation (30% of target)
    const reserveAllocationSol = 30; // Example: 30 SOL for 30% allocation
    
    const reserveBuyResult = await buyReserveAllocation(tokenAddress, reserveAllocationSol);
    
    if (!reserveBuyResult.success) {
      logger.error(`Reserve allocation buy failed: ${reserveBuyResult.error}`);
      // Continue anyway since token is created
    }
    
    // Step 3: Save complete setup details
    const setupDetails = {
      tokenAddress,
      creationTxSignature: creationResult.tokenDetails.creationTxSignature,
      reserveBuyTxSignature: reserveBuyResult.success ? reserveBuyResult.signature : null,
      initialCreatorBuy: creationResult.tokenDetails.initialBuyAmount,
      reserveAllocationBuy: reserveBuyResult.success ? reserveAllocationSol : 0,
      setupCompleted: true,
      completedAt: new Date().toISOString(),
      mintPrivateKey: creationResult.mintPrivateKey
    };
    
    fileStorage.saveRecord('tokenSetup', setupDetails);
    
    logger.info('$INFERNO token setup completed successfully!');
    return {
      success: true,
      setupDetails
    };
  } catch (error) {
    logger.error(`Error setting up token: ${error}`);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  createInfernoToken,
  buyReserveAllocation,
  buyTokens,
  setupInfernoToken
};