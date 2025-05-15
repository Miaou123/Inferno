/**
 * Utility to validate and convert a Solana public key
 * Also useful for debugging key format issues
 */
const { PublicKey } = require('@solana/web3.js');
const bs58 = require('bs58');

/**
 * Validate and convert a public key string to a PublicKey object
 * @param {string} keyString - The public key string to validate and convert
 * @returns {object} Result with success status and either a PublicKey or error message
 */
function validateAndConvertPublicKey(keyString) {
  try {
    // Trim any whitespace that might cause issues
    const trimmedKey = keyString.trim();
    
    // Try to create a PublicKey object
    const publicKey = new PublicKey(trimmedKey);
    
    // Get the base58 encoded string for verification
    const base58String = publicKey.toBase58();
    
    // Log information for debugging
    console.log('✅ Valid Solana public key');
    console.log('Original input:', keyString);
    console.log('Base58 encoded:', base58String);
    console.log('Byte length:', publicKey.toBytes().length);
    
    return {
      success: true,
      publicKey,
      base58String
    };
  } catch (error) {
    console.error('❌ Invalid public key format:', error.message);
    console.error('Input provided:', keyString);
    
    // Try to give more specific error information
    if (error.message.includes('Non-base58 character')) {
      // Identify potential invalid characters
      const base58Chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
      const invalidChars = [...keyString].filter(char => !base58Chars.includes(char));
      
      if (invalidChars.length > 0) {
        console.error('Invalid characters found:', invalidChars.join(', '));
      }
    }
    
    return {
      success: false,
      error: error.message
    };
  }
}

// Example usage
// Replace these with your actual keys to test
const keyExamples = [
  'HeqimeDRCrrieLt85hrHiaRGCPV43kHj3qgac8kbpCZ1',  // Valid example
  'PROGRAM_ID_HERE',                               // Invalid placeholder
  process.env.SOLANA_PUBLIC_KEY,                   // From environment variable
  // Add your key that's causing issues here
];

console.log('=== SOLANA PUBLIC KEY VALIDATION ===');
keyExamples.forEach((key, index) => {
  console.log(`\nTesting key #${index + 1}:`, key);
  const result = validateAndConvertPublicKey(key);
  
  if (result.success) {
    console.log(`Key #${index + 1} is valid ✅`);
  } else {
    console.log(`Key #${index + 1} is invalid ❌ - ${result.error}`);
  }
});