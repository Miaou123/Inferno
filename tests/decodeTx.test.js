const { Connection, VersionedTransaction, TransactionMessage } = require('@solana/web3.js');
const bs58 = require('bs58');
const fs = require('fs');
const path = require('path');

// Look for .env in the parent directory
const envPath = path.join(__dirname, '../.env');
require('dotenv').config({ path: envPath });

// Log environment loading debug information
console.log("\n===== ENV LOADING DEBUG =====");
console.log("Current working directory:", process.cwd());
console.log("Script directory:", __dirname);
console.log("Looking for .env file at:", envPath);

if (fs.existsSync(envPath)) {
  console.log(`.env file exists at: ${envPath}`);
  try {
    const envContent = fs.readFileSync(envPath, 'utf8');
    console.log("Found .env file with content length:", envContent.length);
    // Don't log the actual content for security reasons
    console.log("First few environment variables in .env (keys only):");
    const envLines = envContent.split('\n').filter(line => 
      line.trim() && !line.trim().startsWith('#')
    ).slice(0, 5);
    envLines.forEach(line => {
      const keyPart = line.split('=')[0].trim();
      console.log(`- ${keyPart}`);
    });
  } catch (err) {
    console.log("Error reading .env file:", err.message);
  }
} else {
  console.log(`.env file NOT found at: ${envPath}`);
}

console.log("\n===== LOADED ENV VARIABLES =====");
console.log("SOLANA_RPC_URL:", process.env.SOLANA_RPC_URL || "NOT SET");
console.log("HELIUS_API_KEY:", process.env.HELIUS_API_KEY ? "SET (value hidden)" : "NOT SET");
console.log("NODE_ENV:", process.env.NODE_ENV || "NOT SET");
console.log("===== ENV DEBUG END =====\n");

// Function to decode a transaction and extract program calls
async function decodeTx(signature) {
  try {
    // Use SOLANA_RPC_URL from environment
    const rpcUrl = process.env.SOLANA_RPC_URL;
    console.log("Using RPC URL:", rpcUrl);
    
    // Create connection to RPC
    const connection = new Connection(rpcUrl, 'confirmed');
    
    console.log(`Fetching transaction: ${signature}`);
    
    // Get transaction details
    const tx = await connection.getTransaction(signature, {
      maxSupportedTransactionVersion: 0,
    });
    
    if (!tx) {
      throw new Error('Transaction not found');
    }
    
    console.log('Transaction successfully fetched!');
    
    // Extract key information
    const { meta, transaction, version } = tx;
    
    // Log basic transaction info
    console.log('\n======= TRANSACTION DETAILS =======');
    console.log(`Transaction Version: ${version !== undefined ? version : 'legacy'}`);
    console.log(`Block Time: ${new Date(tx.blockTime * 1000).toISOString()}`);
    console.log(`Fee: ${meta.fee} lamports`);
    
    // Dump full transaction for debugging
    console.log("\n======= DEBUG: TRANSACTION STRUCTURE =======");
    console.log("Keys available in transaction object:", Object.keys(transaction));
    if (transaction.message) {
      console.log("Keys available in transaction.message:", Object.keys(transaction.message));
    }
    
    // Extract program instructions
    console.log('\n======= INSTRUCTIONS =======');
    
    // Handle different transaction versions
    if (version === 0) {
      // This is a versioned transaction
      console.log("Processing versioned transaction (v0)");
      
      if (transaction.message && transaction.message.compiledInstructions) {
        console.log(`Found ${transaction.message.compiledInstructions.length} compiled instructions`);
        
        transaction.message.compiledInstructions.forEach((ix, index) => {
          try {
            console.log(`\nInstruction ${index + 1}:`);
            
            // Get program ID
            const programIndex = ix.programIdIndex;
            const programId = transaction.message.staticAccountKeys[programIndex].toString();
            console.log(`Program ID: ${programId}`);
            
            // Get accounts
            console.log('Accounts:');
            ix.accountKeyIndexes.forEach(keyIndex => {
              const account = transaction.message.staticAccountKeys[keyIndex].toString();
              const isWritable = transaction.message.isAccountWritable(keyIndex);
              const isSigner = transaction.message.isAccountSigner(keyIndex);
              console.log(`  ${account} (Writable: ${isWritable}, Signer: ${isSigner})`);
            });
            
            // Instruction data
            if (ix.data) {
              const data = Buffer.from(ix.data);
              console.log('Data (hex):', data.toString('hex'));
              console.log('Data (base58):', bs58.encode(data));
              
              // Instruction selector
              if (data.length > 0) {
                console.log('Instruction selector:', data[0]);
              }
            }
          } catch (err) {
            console.log(`Error processing instruction ${index + 1}:`, err.message);
          }
        });
      } else {
        console.log("No compiled instructions found in versioned transaction");
      }
    } else {
      // Legacy transaction
      console.log("Processing legacy transaction");
      
      if (transaction.message && transaction.message.instructions) {
        console.log(`Found ${transaction.message.instructions.length} instructions`);
        
        transaction.message.instructions.forEach((ix, index) => {
          try {
            console.log(`\nInstruction ${index + 1}:`);
            
            // Get program ID
            const programId = transaction.message.accountKeys[ix.programIdIndex].toString();
            console.log(`Program ID: ${programId}`);
            
            // Get accounts
            console.log('Accounts:');
            ix.accounts.forEach(accountIdx => {
              const account = transaction.message.accountKeys[accountIdx];
              const isWritable = transaction.message.isAccountWritable(accountIdx);
              const isSigner = transaction.message.isAccountSigner(accountIdx);
              console.log(`  ${account.toString()} (Writable: ${isWritable}, Signer: ${isSigner})`);
            });
            
            // Instruction data
            if (ix.data) {
              const data = bs58.decode(ix.data);
              console.log('Data (hex):', Buffer.from(data).toString('hex'));
              console.log('Data (base58):', ix.data);
              
              // Instruction selector
              if (data.length > 0) {
                console.log('Instruction selector:', data[0]);
              }
            }
          } catch (err) {
            console.log(`Error processing instruction ${index + 1}:`, err.message);
          }
        });
      } else {
        console.log("No instructions found in legacy transaction");
      }
    }
    
    // Log token transfers if any
    if (meta.postTokenBalances && meta.postTokenBalances.length > 0) {
      console.log('\n======= TOKEN TRANSFERS =======');
      
      // Compare pre and post token balances to identify transfers
      for (let i = 0; i < meta.postTokenBalances.length; i++) {
        const post = meta.postTokenBalances[i];
        
        // Find matching pre balance
        const pre = meta.preTokenBalances.find(
          pre => pre.accountIndex === post.accountIndex && pre.mint === post.mint
        );
        
        if (pre) {
          const preAmount = parseInt(pre.uiTokenAmount.amount);
          const postAmount = parseInt(post.uiTokenAmount.amount);
          const difference = postAmount - preAmount;
          
          if (difference !== 0) {
            console.log(`Token: ${post.mint}`);
            console.log(`Account: ${transaction.message.accountKeys 
              ? transaction.message.accountKeys[post.accountIndex].toString() 
              : transaction.message.staticAccountKeys[post.accountIndex].toString()}`);
            console.log(`Change: ${difference > 0 ? '+' : ''}${difference / Math.pow(10, post.uiTokenAmount.decimals)} tokens`);
          }
        }
      }
    }
    
    // Log SOL balance changes
    if (meta.preBalances && meta.postBalances) {
      console.log('\n======= SOL BALANCE CHANGES =======');
      
      meta.preBalances.forEach((preBal, idx) => {
        const postBal = meta.postBalances[idx];
        if (preBal !== postBal) {
          const account = transaction.message.accountKeys 
            ? transaction.message.accountKeys[idx].toString() 
            : transaction.message.staticAccountKeys[idx].toString();
          const change = (postBal - preBal) / 1e9; // Convert lamports to SOL
          console.log(`Account: ${account}`);
          console.log(`Change: ${change > 0 ? '+' : ''}${change} SOL`);
        }
      });
    }
    
    return tx;
  } catch (error) {
    console.error('Error decoding transaction:', error);
    throw error;
  }
}

// Main function
async function main() {
  // Use the transaction signature you provided
  const signature = '2xkGHu4ENjof88guQuzHPmtHddDsT5KdD8uWpXuwTGkq1cWkZ64Ggu3cQ9bVtp4VbEgbgC2mA6GT6jUhiL3k1yqN';
  
  try {
    await decodeTx(signature);
  } catch (error) {
    console.error('Error in main function:', error);
  }
}

main();