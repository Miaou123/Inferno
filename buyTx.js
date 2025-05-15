const { 
    Connection, 
    PublicKey, 
    Transaction, 
    TransactionInstruction, 
    sendAndConfirmTransaction, 
    ComputeBudgetProgram,
    Keypair
  } = require('@solana/web3.js');
  const bs58 = require('bs58');
  
  async function executePumpSwap() {
    // Initialize connection to Solana network
    const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
    
    // Load your keypair (from a private key)
    // IMPORTANT: Don't hardcode your private key in production code
    const privateKey = bs58.decode('22s4K3MdLvvvD953yWMPKvPc2swJvDzCowyCL5QpPitfRyrUXd77dDHTAdqo6ze9CNVKGQaSMwaJ3jMEeZhwKtM1'); // Replace with your private key
    const keypair = Keypair.fromSecretKey(privateKey);
    
    // Define the accounts needed for the swap
    const accounts = {
      buyer: new PublicKey('HeqimeDRCrrieLt85hrHiaRGCPV43kHj3qgac8kbpCZ1'),
      stateAccount: new PublicKey('CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM'),
      creator: new PublicKey('CPLnZDbHTrCqY3Tvzvk1VmYNuGHwmyfQwQ6gBhd6pHmc'),
      creatorTokenAccount: new PublicKey('9h3N8R7wMoNo787DF3n5Zx5nWyNXDtcUfaxmT2g5yxSV'),
      buyerTokenAccount: new PublicKey('A3esEVbFFJy1BbHznygcVuepBFDRvva28EPE8ocNCN4h'),
      creatorFeeAccount: new PublicKey('ANYekpdHFWSmVzEt9iBeLFMFeQiPGjcZexFkLprtcCHj'),
      stateAccountInfo: new PublicKey('4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf'),
      tokenMint: new PublicKey('4aLyGDChFFmyhXcSpJDJnbQSJ9jfABrqJyLufFTGpump'),
      systemProgram: new PublicKey('11111111111111111111111111111111'),
      tokenProgram: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
      eventAuthority: new PublicKey('Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1'),
    };
    
    // Define program IDs
    const COMPUTE_BUDGET_PROGRAM_ID = new PublicKey('ComputeBudget111111111111111111111111111111');
    const PUMP_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
    
    // Create a new transaction
    const transaction = new Transaction();
    
    // Add compute budget instructions
    // 1. Set compute unit limit (0xBE50 = 48720)
    transaction.add(
      ComputeBudgetProgram.setComputeUnitLimit({
        units: 48720 // 0xBE50 in decimal
      })
    );
    
    // 2. Set compute unit price (0x18A3AE = 1624494)
    transaction.add(
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 1624494 // 0x18A3AE in decimal
      })
    );
    
    // 3. Add the buy instruction
    // Data from the transaction: [102, 6, 61, 18, 1, 218, 235, 234, 227, 163, 221, 204, 53, 3, 0, 0, 128, 101, 20, 6, 0, 0, 0, 0]
    // Looking at the data format, we can see:
    // - First bytes represent instruction discriminator for "Buy"
    // - The rest is the amount of SOL and minimum tokens to receive
    
    // Amount from the data: 3529605 tokens (converted from lamports)
    const buyAmount = 0.1; // SOL amount (adjust based on your needs)
    const minTokensToReceive = 3529605; // Minimum amount of tokens to receive
    
    // Create buy instruction data buffer
    const buyData = Buffer.from([
      102, 6, 61, 18, 1, 218, 235, 234, // instruction discriminator
      227, 163, 221, 204, 53, 3, 0, 0,  // SOL amount in lamports
      128, 101, 20, 6, 0, 0, 0, 0       // minimum tokens to receive
    ]);
    
    // Create the buy instruction
    const buyInstruction = new TransactionInstruction({
      programId: PUMP_PROGRAM_ID,
      keys: [
        { pubkey: accounts.stateAccountInfo, isSigner: false, isWritable: true },
        { pubkey: accounts.stateAccount, isSigner: false, isWritable: true },
        { pubkey: accounts.tokenMint, isSigner: false, isWritable: false },
        { pubkey: accounts.creator, isSigner: false, isWritable: true },
        { pubkey: accounts.creatorTokenAccount, isSigner: false, isWritable: true },
        { pubkey: accounts.buyerTokenAccount, isSigner: false, isWritable: true },
        { pubkey: accounts.buyer, isSigner: true, isWritable: true },
        { pubkey: accounts.systemProgram, isSigner: false, isWritable: false },
        { pubkey: accounts.tokenProgram, isSigner: false, isWritable: false },
        { pubkey: accounts.creatorFeeAccount, isSigner: false, isWritable: true },
        { pubkey: accounts.eventAuthority, isSigner: false, isWritable: false },
        { pubkey: PUMP_PROGRAM_ID, isSigner: false, isWritable: false }
      ],
      data: buyData
    });
    
    transaction.add(buyInstruction);
    
    // Send and confirm the transaction
    try {
      const signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [keypair], // only the buyer needs to sign
        {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
          maxRetries: 3
        }
      );
      
      console.log('Transaction successful!');
      console.log(`Transaction signature: ${signature}`);
      return signature;
    } catch (error) {
      console.error('Transaction failed:', error);
      throw error;
    }
  }
  
  // Execute the swap
  executePumpSwap().catch(console.error);