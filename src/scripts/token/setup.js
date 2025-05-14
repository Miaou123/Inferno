// Add this to src/scripts/token/setup.js
const { setupInfernoToken } = require('./create');
const path = require('path');

const setup = async () => {
  // Define your token details here
  const tokenOptions = {
    name: "$test",                   // Your token name
    symbol: "test",                  // Your token ticker symbol
    description: "test",  // Token description
    twitter: "",  // Twitter URL
    telegram: "",        // Telegram URL
    website: "",             // Website URL
    imageFile: path.join(__dirname, "../../../public/images/logo.png"),  // Path to your logo image
    initialBuyAmount: 0.1  // Initial buy amount in SOL
  };
  
  // Create the token with your custom options
  const result = await setupInfernoToken(tokenOptions);
  
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.success ? 0 : 1);
};

setup();