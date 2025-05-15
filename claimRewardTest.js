/**
 * Exact transaction recreation for pump.fun rewards claim
 * No abstractions, just direct transaction building
 */
const { 
    Connection, 
    PublicKey, 
    Transaction, 
    TransactionInstruction,
    Keypair,
    sendAndConfirmTransaction
  } = require('@solana/web3.js');
  const bs58 = require('bs58');
  require('dotenv').config();
  
  // Create keypair from private key
  const createKeypair = (privateKeyString = process.env.SOLANA_PRIVATE_KEY) => {
    try {
      if (!privateKeyString) {
        throw new Error('SOLANA_PRIVATE_KEY not set in environment');
      }
      
      // Parse private key (handles both base58 and JSON array formats)
      let secretKey;
      try {
        secretKey = bs58.decode(privateKeyString);
      } catch (e) {
        try {
          secretKey = Uint8Array.from(JSON.parse(privateKeyString));
        } catch (jsonError) {
          throw new Error('Failed to parse private key. Use base58 or JSON array format.');
        }
      }
      
      return Keypair.fromSecretKey(secretKey);
    } catch (error) {
      console.error('Error creating keypair:', error);
      throw error;
    }
  };
  
  // Create Solana connection
  const getConnection = () => {
    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
    return new Connection(rpcUrl, {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 60000
    });
  };
  
  // Main claim function
  const claimRewards = async () => {
    try {
      console.log('Starting reward claim process...');
      
      // Get keypair and connection
      const keypair = createKeypair();
      const connection = getConnection();
      
      console.log(`Using wallet: ${keypair.publicKey.toString()}`);
      
      // Get latest blockhash
      const { blockhash } = await connection.getLatestBlockhash('confirmed');
      console.log(`Got blockhash: ${blockhash}`);
      
      // HARDCODED ADDRESSES FROM YOUR TRANSACTION
      // These are the exact values from your transaction
      const ADDRESSES = {
        COMPUTE_BUDGET: new PublicKey('ComputeBudget111111111111111111111111111111'),
        SYSTEM_PROGRAM: new PublicKey('11111111111111111111111111111111'),
        COIN_PROGRAM: new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'),
        ASSOCIATED_TOKEN_PROGRAM: new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'),
        TOKEN_PROGRAM: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
        CREATOR_VAULT: new PublicKey('ANYekpdHFWSmVzEt9iBeLFMFeQiPGjcZexFkLprtcCHj'),
        EVENT_AUTHORITY: new PublicKey('Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1'),
        SOL_MINT: new PublicKey('So11111111111111111111111111111111111111112'),
        VAULT_AUTHORITY: new PublicKey('7S8Uf4JHVVxdLJMh68WCUpxWqoy3wMfPGMEqGKY31Rg5'),
        REWARD_PROGRAM: new PublicKey('pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA'),
        PROGRAM_AUTHORITY: new PublicKey('GS4CU59F31iL7aR2Q8zVS8DRrcRnXX1yjQ66TqNVQnaR')
      };
      
      // HARDCODED INSTRUCTION DATA FROM YOUR TRANSACTION
      const INSTRUCTION_DATA = {
        SET_COMPUTE_UNIT_LIMIT: Buffer.from([2, 248, 61, 1, 0]),
        SET_COMPUTE_UNIT_PRICE: Buffer.from([3, 160, 134, 1, 0, 0, 0, 0, 0]),
        COLLECT_CREATOR_FEE: Buffer.from([20, 22, 86, 123, 198, 28, 219, 132]),
        COLLECT_COIN_CREATOR_FEE: Buffer.from([160, 57, 89, 42, 181, 139, 43, 66])
      };
      
      // Create transaction
      const transaction = new Transaction();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = keypair.publicKey;
      
      // 1. Compute Budget: Set compute unit limit
      transaction.add(new TransactionInstruction({
        programId: ADDRESSES.COMPUTE_BUDGET,
        keys: [],
        data: INSTRUCTION_DATA.SET_COMPUTE_UNIT_LIMIT
      }));
      
      // 2. Compute Budget: Set compute unit price
      transaction.add(new TransactionInstruction({
        programId: ADDRESSES.COMPUTE_BUDGET,
        keys: [],
        data: INSTRUCTION_DATA.SET_COMPUTE_UNIT_PRICE
      }));
      
      // 3. Collect creator fee - THIS IS THE MAIN INSTRUCTION THAT COLLECTS REWARDS
      transaction.add(new TransactionInstruction({
        programId: ADDRESSES.COIN_PROGRAM,
        keys: [
          { pubkey: keypair.publicKey, isSigner: true, isWritable: true },
          { pubkey: ADDRESSES.CREATOR_VAULT, isSigner: false, isWritable: true },
          { pubkey: ADDRESSES.SYSTEM_PROGRAM, isSigner: false, isWritable: false },
          { pubkey: ADDRESSES.EVENT_AUTHORITY, isSigner: false, isWritable: false },
          { pubkey: ADDRESSES.COIN_PROGRAM, isSigner: false, isWritable: false }
        ],
        data: INSTRUCTION_DATA.COLLECT_CREATOR_FEE
      }));
      
      // We'll skip the token account creation instructions for now to see if just the creator fee collection works
      
      // First simulate the transaction
      console.log('Simulating transaction with just creator fee collection...');
      const simulation = await connection.simulateTransaction(transaction);
      
      // Log simulation results regardless of success/failure
      if (simulation.value.logs) {
        console.log('Simulation logs:');
        simulation.value.logs.forEach(log => console.log(`  ${log}`));
      }
      
      if (simulation.value.err) {
        console.error('Simulation error:', simulation.value.err);
        throw new Error(`Transaction simulation failed: ${JSON.stringify(simulation.value.err)}`);
      }
      
      console.log('Simulation successful. Sending transaction...');
      
      // Send and confirm transaction
      const signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [keypair]
      );
      
      console.log(`Transaction successful! Signature: ${signature}`);
      
      // Get transaction details
      const txDetails = await connection.getTransaction(signature, {
        commitment: 'confirmed',
      });
      
      // Try to determine claimed amount
      let claimAmount = 0;
      if (txDetails && txDetails.meta) {
        // Check balance changes
        const walletIndex = txDetails.transaction.message.accountKeys.findIndex(
          key => key.equals(keypair.publicKey)
        );
        
        if (walletIndex >= 0) {
          const preBalance = txDetails.meta.preBalances[walletIndex];
          const postBalance = txDetails.meta.postBalances[walletIndex];
          const balanceChange = postBalance - preBalance;
          
          // Account for fee
          const fee = txDetails.meta.fee;
          const totalChange = (balanceChange + fee) / 1e9; // Convert lamports to SOL
          
          if (totalChange > 0) {
            claimAmount = totalChange;
          }
        }
      }
      
      return {
        success: true,
        signature,
        rewardAmount: claimAmount,
      };
    } catch (error) {
      console.error('Error claiming rewards:', error);
      return { success: false, error: error.message };
    }
  };
  
  // Run the claim function
  claimRewards()
    .then(result => {
      console.log('\nClaim result:', result);
      process.exit(0);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });