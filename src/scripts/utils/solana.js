/**
 * Solana utility functions for $INFERNO token operations
 */
const { 
  Connection, 
  PublicKey, 
  Keypair, 
  Transaction, 
  SystemProgram,
  sendAndConfirmTransaction,
  MemoProgram
} = require('@solana/web3.js');
const { 
  Token, 
  TOKEN_PROGRAM_ID 
} = require('@solana/spl-token');
const fs = require('fs');
const path = require('path');
const bs58 = require('bs58');
const logger = require('./logger');
require('dotenv').config();

// Create connection to Solana network
const getConnection = () => {
  const rpcUrl = process.env.SOLANA_RPC_URL;
  // Set higher confirmation level and commitment for Helius
  return new Connection(rpcUrl, {
    commitment: 'confirmed',
    confirmTransactionInitialTimeout: 60000, // 60 seconds
    disableRetryOnRateLimit: false
  });
};

/**
 * Create a keypair from a private key
 * @param {String} privateKeyString - Private key as string or path to key file
 * @returns {Keypair} Solana keypair
 */
const createKeypair = (privateKeyString = process.env.SOLANA_PRIVATE_KEY) => {
  try {
    // In mock mode, generate a random keypair
    if (process.env.MOCK_MODE === 'true') {
      return Keypair.generate();
    }
    
    // Check if privateKeyString is a path to a file
    if (privateKeyString.startsWith('/') || privateKeyString.startsWith('./')) {
      const keyData = JSON.parse(fs.readFileSync(privateKeyString, 'utf-8'));
      return Keypair.fromSecretKey(new Uint8Array(keyData));
    }
    
    // Handle base58 encoded private keys
    if (privateKeyString.match(/^[A-Za-z0-9]{64,88}$/)) {
      try {
        // Try to decode as base58
        const decodedKey = bs58.decode(privateKeyString);
        return Keypair.fromSecretKey(decodedKey);
      } catch (e) {
        logger.warn('Failed to decode private key as base58, trying JSON parse');
      }
    }
    
    // Try as JSON array of numbers
    try {
      const privateKey = JSON.parse(privateKeyString);
      return Keypair.fromSecretKey(new Uint8Array(privateKey));
    } catch (jsonError) {
      logger.error('Failed to parse private key as JSON:', jsonError);
      throw jsonError;
    }
  } catch (error) {
    logger.error('Error creating keypair:', error);
    throw new Error(`Failed to create keypair: ${error.message}`);
  }
};

/**
 * Get reserve wallet keypair
 * @returns {Keypair} Reserve wallet keypair
 */
const getReserveWalletKeypair = () => {
  return createKeypair(process.env.RESERVE_WALLET_PRIVATE_KEY);
};

const getEnhancedTransactionDetails = async (signature) => {
  const connection = getConnection();
  // Use Helius-specific enhanced transaction method
  const txDetails = await connection.getTransaction(signature, {
    maxSupportedTransactionVersion: 0,
    commitment: 'confirmed'
  });
  return txDetails;
};

/**
 * Get token balance for a wallet
 * @param {String} walletAddress - Wallet public key
 * @param {String} tokenAddress - Token mint address
 * @returns {Promise<Number>} Token balance
 */
const getTokenBalance = async (walletAddress, tokenAddress = process.env.TOKEN_ADDRESS) => {
  try {
    const connection = getConnection();
    const wallet = new PublicKey(walletAddress);
    const token = new PublicKey(tokenAddress);
    
    // Get all token accounts owned by the wallet for this specific token
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      wallet,
      { mint: token }
    );
    
    // If no accounts found, return 0
    if (tokenAccounts.value.length === 0) {
      return 0;
    }
    
    // Sum the balance of all accounts (normally there's just one)
    let totalBalance = 0;
    for (const account of tokenAccounts.value) {
      const parsedInfo = account.account.data.parsed.info;
      totalBalance += parsedInfo.tokenAmount.uiAmount;
    }
    
    return totalBalance;
  } catch (error) {
    logger.error('Error getting token balance:', error);
    throw new Error(`Failed to get token balance: ${error.message}`);
  }
};

/**
 * Get SOL balance for a wallet
 * @param {String} walletAddress - Wallet public key
 * @returns {Promise<Number>} SOL balance in SOL units (not lamports)
 */
const getSolBalance = async (walletAddress) => {
  try {
    const connection = getConnection();
    const wallet = new PublicKey(walletAddress);
    
    const balance = await connection.getBalance(wallet);
    return balance / 1_000_000_000; // Convert lamports to SOL
  } catch (error) {
    logger.error('Error getting SOL balance:', error);
    throw new Error(`Failed to get SOL balance: ${error.message}`);
  }
};

/**
 * Burn tokens by sending them to the burn address
 * @param {Keypair} senderKeypair - Keypair of the sender
 * @param {Number} amount - Amount of tokens to burn
 * @param {String} tokenAddress - Token mint address
 * @param {String} burnType - Type of burn ('milestone' or 'buyback')
 * @returns {Promise<Object>} Transaction result
 */
const burnTokens = async (
  senderKeypair,
  amount,
  tokenAddress = process.env.TOKEN_ADDRESS,
  burnType = 'general'
) => {
  try {
    const connection = getConnection();
    const tokenPublicKey = new PublicKey(tokenAddress);
    
    // Use burn address from environment or fall back to standard address
    const burnAddress = process.env.BURN_ADDRESS || "1nc1nerator11111111111111111111111111111111";
    const destinationPublicKey = new PublicKey(burnAddress);
    
    // Check wallet balance before proceeding
    const senderBalance = await getTokenBalance(senderKeypair.publicKey.toString(), tokenAddress);
    
    // Safety check: Verify there are sufficient tokens in the wallet
    if (senderBalance < amount) {
      logger.error(`Insufficient tokens in ${burnType} wallet. Required: ${amount.toLocaleString()}, Available: ${senderBalance.toLocaleString()}`);
      return {
        success: false,
        error: 'INSUFFICIENT_TOKENS',
        details: {
          required: amount,
          available: senderBalance,
          walletType: burnType
        }
      };
    }
    
    logger.info(`Sufficient tokens available in ${burnType} wallet. Required: ${amount.toLocaleString()}, Available: ${senderBalance.toLocaleString()}`);
    
    // Create token object
    const token = new Token(
      connection,
      tokenPublicKey,
      TOKEN_PROGRAM_ID,
      senderKeypair
    );
    
    // Get sender token account
    const senderTokenAccount = await token.getOrCreateAssociatedAccountInfo(
      senderKeypair.publicKey
    );
    
    // Get burn address token account or create it if it doesn't exist
    let destinationTokenAccount;
    try {
      destinationTokenAccount = await token.getAssociatedTokenAddress(
        destinationPublicKey
      );
    } catch (error) {
      // Create the account if it doesn't exist
      const transaction = new Transaction().add(
        Token.createAssociatedTokenAccountInstruction(
          TOKEN_PROGRAM_ID,
          tokenPublicKey,
          destinationPublicKey,
          senderKeypair.publicKey,
          senderKeypair.publicKey
        )
      );
      
      await sendAndConfirmTransaction(
        connection,
        transaction,
        [senderKeypair],
        { commitment: 'confirmed' }
      );
      
      destinationTokenAccount = await token.getAssociatedTokenAddress(
        destinationPublicKey
      );
    }
    
    // Convert amount to token units (account for decimals)
    const tokenInfo = await token.getMintInfo();
    const decimals = tokenInfo.decimals;
    const amountInTokenUnits = amount * (10 ** decimals);
    
    // Create transaction with token transfer and memo
    const transaction = new Transaction();
    
    // Add token transfer instruction
    transaction.add(
      Token.createTransferInstruction(
        TOKEN_PROGRAM_ID,
        senderTokenAccount.address,
        destinationTokenAccount,
        senderKeypair.publicKey,
        [],
        amountInTokenUnits
      )
    );
    
    // Add memo instruction for transparency
    transaction.add(
      MemoProgram.createMemo({
        signers: [senderKeypair],
        memo: `$INFERNO ${burnType.toUpperCase()} BURN: ${amount.toLocaleString()} tokens`
      })
    );
    
    try {
      // First simulate the transaction to catch any issues
      const simulation = await connection.simulateTransaction(transaction);
      if (simulation.value.err) {
        logger.error(`Transaction simulation failed: ${JSON.stringify(simulation.value.err)}`);
        return {
          success: false,
          error: 'SIMULATION_FAILED',
          details: simulation.value.err
        };
      }
      
      // Send and confirm with proper retry handling
      const signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [senderKeypair],
        {
          skipPreflight: false, 
          preflightCommitment: 'confirmed',
          maxRetries: 3
        }
      );
      
      logger.info(`Burned ${amount.toLocaleString()} tokens with tx: ${signature}`);
      
      return {
        success: true,
        signature,
        amount,
        sender: senderKeypair.publicKey.toString(),
        burnAddress,
        memo: `$INFERNO ${burnType.toUpperCase()} BURN: ${amount.toLocaleString()} tokens`
      };
    } catch (txError) {
      // Differentiate between error types for better handling
      const errorMessage = txError.message || '';
      
      // Categorize error types
      let errorType = 'UNKNOWN';
      let shouldRetry = false;
      
      if (errorMessage.includes('insufficient funds')) {
        errorType = 'INSUFFICIENT_FUNDS';
        shouldRetry = false;
      } else if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
        errorType = 'RATE_LIMIT';
        shouldRetry = true;
      } else if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
        errorType = 'TIMEOUT';
        shouldRetry = true;
      } else if (errorMessage.includes('blockhash not found') || errorMessage.includes('old blockhash')) {
        errorType = 'BLOCKHASH_EXPIRED';
        shouldRetry = true;
      } else if (errorMessage.includes('network error') || errorMessage.includes('connection error')) {
        errorType = 'NETWORK_ERROR';
        shouldRetry = true;
      }
      
      logger.error(`Transaction failed with error type ${errorType}: ${errorMessage}`);
      
      return {
        success: false,
        error: errorType,
        shouldRetry,
        details: errorMessage
      };
    }
  } catch (error) {
    logger.error('Error in burn process:', error);
    return {
      success: false,
      error: 'PROCESSING_ERROR',
      details: error.message
    };
  }
};

/**
 * Transfer SOL from one wallet to another
 * @param {Keypair} senderKeypair - Keypair of the sender
 * @param {String} destinationAddress - Recipient wallet address
 * @param {Number} amount - Amount of SOL to send
 * @returns {Promise<Object>} Transaction result
 */
const transferSol = async (senderKeypair, destinationAddress, amount) => {
  try {
    const connection = getConnection();
    const destination = new PublicKey(destinationAddress);
    
    // Convert SOL to lamports
    const lamports = amount * 1_000_000_000;
    
    // Create a simple transfer transaction
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: senderKeypair.publicKey,
        toPubkey: destination,
        lamports
      })
    );
    
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [senderKeypair],
      { commitment: 'confirmed' }
    );
    
    logger.info(`Transferred ${amount} SOL with tx: ${signature}`);
    
    return {
      success: true,
      signature,
      amount,
      sender: senderKeypair.publicKey.toString(),
      recipient: destinationAddress
    };
  } catch (error) {
    logger.error('Error transferring SOL:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

module.exports = {
  getConnection,
  createKeypair,
  getReserveWalletKeypair,
  getTokenBalance,
  getSolBalance,
  burnTokens,
  transferSol,
  getEnhancedTransactionDetails
};