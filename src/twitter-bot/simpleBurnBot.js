/**
 * Simple Twitter Bot for $INFERNO Burn Notifications
 * Posts generic messages when burns happen - no AI required
 */
const { TwitterApi } = require('twitter-api-v2');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

// Load environment variables
dotenv.config();

class SimpleBurnBot {
    constructor() {
        this.checkEnvVars();
        
        // Initialize Twitter API (only if not in test mode)
        const isTestMode = process.env.TEST_MODE === 'true';
        
        if (!isTestMode) {
            // For Twitter API v2 with Free tier, we need to use OAuth 1.0a
            this.twitter = new TwitterApi({
                appKey: process.env.TWITTER_API_KEY,
                appSecret: process.env.TWITTER_API_SECRET,
                accessToken: process.env.TWITTER_ACCESS_TOKEN,
                accessSecret: process.env.TWITTER_ACCESS_SECRET,
            });
            
            console.log('🔧 Twitter API initialized with OAuth 1.0a for v2 access');
        }

        this.tweetCount = 0;
        
        // File monitoring
        this.burnsFilePath = path.join(__dirname, '../../data/burns.json');
        
        // Debug file paths
        console.log(`📁 Burns file path: ${this.burnsFilePath}`);
        console.log(`📁 Burns file exists: ${fs.existsSync(this.burnsFilePath)}`);
        
        if (fs.existsSync(this.burnsFilePath)) {
            try {
                const burns = JSON.parse(fs.readFileSync(this.burnsFilePath, 'utf8'));
                console.log(`📊 Burns file contains ${burns.length} burns`);
                const untweetedCount = burns.filter(burn => !burn.tweetPosted).length;
                console.log(`📊 Untweeted burns: ${untweetedCount}`);
            } catch (error) {
                console.log(`❌ Error reading burns file: ${error.message}`);
            }
        }
        
        console.log(`🔥 Simple Burn Bot initialized - ${isTestMode ? 'TEST MODE' : 'LIVE MODE'} 🔥`);
        if (isTestMode) {
            console.log('💡 Running in TEST MODE - tweets will be generated but NOT posted to Twitter');
        }
    }

    checkEnvVars() {
        const isTestMode = process.env.TEST_MODE === 'true';
        
        let required = [];
        
        // Only require Twitter credentials if not in test mode
        if (!isTestMode) {
            required = [
                'TWITTER_API_KEY',
                'TWITTER_API_SECRET', 
                'TWITTER_ACCESS_TOKEN',
                'TWITTER_ACCESS_SECRET'
            ];
        }

        const missing = required.filter(varName => !process.env[varName]);
        
        if (missing.length > 0) {
            console.error('❌ Missing environment variables:');
            missing.forEach(varName => console.error(`- ${varName}`));
            if (isTestMode) {
                console.log('💡 In TEST MODE, no Twitter credentials required');
            }
            throw new Error('Missing required environment variables');
        }

        console.log('✅ All required environment variables are present');
    }

/**
 * Generate a simple burn announcement message
 * @param {string} burnType - 'milestone' or 'buyback'
 * @param {object} burnData - Burn transaction data
 * @returns {string} Tweet message
 */
generateBurnMessage(burnType, burnData) {
    const burnTxHash = burnData.txSignature;
    const burnTxLink = `https://solscan.io/tx/${burnTxHash}`;
    
    if (burnType === 'milestone') {
        const milestoneAmount = burnData.milestone || burnData.marketCapAtBurn || 0;
        const tokensDestroyed = Math.round(burnData.burnAmount);
        const percentOfSupply = burnData.details?.percentOfSupply || 0;
        
        return `🔥 MILESTONE BURN! 🔥

${milestoneAmount.toLocaleString()} milestone reached!
💥 ${tokensDestroyed.toLocaleString()} $INFERNO burned (${percentOfSupply}% supply)

${burnTxLink}`;
    } else {
        // Buyback burn
        const solSpent = parseFloat(burnData.solSpent || 0);
        const tokensBurned = Math.round(burnData.burnAmount);
        const usdValue = parseFloat(burnData.solSpentUsd || 0);
        
        // Check if we have buyback transaction hash
        const buybackTxHash = burnData.buybackTxSignature || burnData.details?.buybackTxSignature;
        
        if (buybackTxHash) {
            const buybackTxLink = `https://solscan.io/tx/${buybackTxHash}`;
            
            return `BUYBACK AND BURN! 🔥

💰 ${solSpent.toFixed(3)} → buyback
💥 ${tokensBurned.toLocaleString()} $INFERNO burned

🛒 Buyback: ${buybackTxLink}
🔥 Burn: ${burnTxLink}`;
        } else {
            // Fallback if no buyback tx hash
            return `BUYBACK AND BURN! 🔥

💰 ${solSpent.toFixed(3)} SOL ($${usdValue.toFixed(0)}) → buyback
💥 ${tokensBurned.toLocaleString()} $INFERNO burned

${burnTxLink}`;
        }
    }
}

    async postTweet(tweetText, tweetType = 'burn') {
        const isTestMode = process.env.TEST_MODE === 'true';
        
        try {
            if (isTestMode) {
                this.tweetCount++;
                console.log(`🔥 TEST MODE - Would post ${tweetType} tweet...`);
                console.log(`\n✅ TEST Tweet #${this.tweetCount} (NOT posted to Twitter):`);
                console.log(`"${tweetText}"`);
                console.log(`📏 Length: ${tweetText.length}/280`);
                console.log('💡 Set TEST_MODE=false in .env to post real tweets');
                return { data: { id: `test_${Date.now()}`, text: tweetText } };
            } else {
                console.log(`🔥 Posting ${tweetType} tweet using Twitter API v2...`);
                
                // Use Twitter API v2 with proper authentication
                const tweet = await this.twitter.v2.tweet({
                    text: tweetText
                });
                
                this.tweetCount++;
                console.log(`\n✅ ${tweetType.toUpperCase()} Tweet #${this.tweetCount} posted successfully:`);
                console.log(`"${tweetText}"`);
                console.log(`📏 Length: ${tweetText.length}/280`);
                console.log(`🔗 Tweet ID: ${tweet.data.id}`);
                return tweet;
            }
        } catch (error) {
            console.error('❌ Error posting tweet:', error.message);
            
            // Handle specific Twitter API errors
            if (error.code === 403) {
                if (error.errors && error.errors[0] && error.errors[0].code === 453) {
                    console.error('\n🚨 TWITTER API ACCESS LEVEL ISSUE:');
                    console.error('Your current access level doesn\'t allow tweet posting.');
                    console.error('You need to upgrade your Twitter API access level.');
                    console.error('Visit: https://developer.x.com/en/portal/product');
                    console.error('Options:');
                    console.error('- Basic tier: $100/month (allows tweet posting)');
                    console.error('- Or use TEST_MODE=true to simulate posting\n');
                } else {
                    console.error('\n🚨 TWITTER API FORBIDDEN (403):');
                    console.error('Check your API credentials and permissions');
                    console.error('Make sure your app has "Read and Write" permissions\n');
                }
            } else if (error.code === 401) {
                console.error('\n🚨 TWITTER API UNAUTHORIZED (401):');
                console.error('Check your API keys and tokens in .env file\n');
            } else if (error.code === 429) {
                console.error('\n🚨 TWITTER API RATE LIMIT (429):');
                console.error('Too many requests. Wait before trying again.\n');
            } else if (error.errors && error.errors[0]) {
                console.error(`\n🚨 TWITTER API ERROR: ${error.errors[0].message}\n`);
            }
            
            throw error;
        }
    }

    /**
     * Simply get all burns that haven't been tweeted yet
     * @returns {Array} Burns that need to be tweeted
     */
    getUntweetedBurns() {
        try {
            console.log('\n🔍 === CHECKING FOR UNTWEETED BURNS ===');
            
            if (!fs.existsSync(this.burnsFilePath)) {
                console.log('❌ Burns file does not exist:', this.burnsFilePath);
                return [];
            }

            console.log('✅ Burns file exists, reading...');
            const burns = JSON.parse(fs.readFileSync(this.burnsFilePath, 'utf8'));
            
            if (!Array.isArray(burns) || burns.length === 0) {
                console.log('❌ No burns found or invalid format');
                return [];
            }

            console.log(`📊 Total burns found: ${burns.length}`);
            
            // Simply filter for burns that don't have tweetPosted: true
            const untweetedBurns = burns.filter(burn => !burn.tweetPosted);
            
            console.log(`🔍 Untweeted burns found: ${untweetedBurns.length}`);
            
            // Log each untweeted burn
            untweetedBurns.forEach((burn, index) => {
                console.log(`  ${index + 1}. ID: ${burn.id}, Type: ${burn.burnType}, Amount: ${burn.burnAmount}, Timestamp: ${burn.timestamp}`);
            });
            
            if (untweetedBurns.length === 0) {
                console.log('✅ All burns have been tweeted');
                return [];
            }
            
            // Sort by timestamp (oldest first) so we tweet in chronological order
            const sortedBurns = untweetedBurns.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            
            console.log(`🎯 Returning ${sortedBurns.length} burns to tweet (oldest first)`);
            return sortedBurns;
            
        } catch (error) {
            console.error('💥 Error checking for untweeted burns:', error);
            return [];
        }
    }

    async markBurnAsTweeted(burnId) {
        try {
            if (!fs.existsSync(this.burnsFilePath)) {
                console.log('⚠️ Burns file does not exist, cannot mark as tweeted');
                return;
            }

            // Read current burns
            const burns = JSON.parse(fs.readFileSync(this.burnsFilePath, 'utf8'));
            
            // Find and update the specific burn
            const updatedBurns = burns.map(burn => {
                if (burn.id === burnId) {
                    return {
                        ...burn,
                        tweetPosted: true,
                        tweetedAt: new Date().toISOString()
                    };
                }
                return burn;
            });
            
            // Write back to file
            fs.writeFileSync(this.burnsFilePath, JSON.stringify(updatedBurns, null, 2));
            
            console.log(`📝 Marked burn ${burnId} as tweeted in burns.json`);
        } catch (error) {
            console.error(`Error marking burn as tweeted:`, error);
        }
    }

    async processBurn(burn) {
        try {
            console.log(`\n🔥 Processing ${burn.burnType} burn: ${burn.id}`);
            
            // Double-check if this burn was already tweeted (safety check)
            if (burn.tweetPosted) {
                console.log(`⏭️ Skipping burn ${burn.id} - already tweeted`);
                return;
            }
            
            const burnType = burn.initiator === 'milestone-script' ? 'milestone' : 'buyback';
            
            console.log(`📊 Burn data:`, {
                type: burnType,
                amount: burn.burnAmount,
                solSpent: burn.solSpent || 0,
                milestone: burn.milestone || burn.marketCapAtBurn,
                txSignature: burn.txSignature
            });
            
            const tweet = this.generateBurnMessage(burnType, burn);
            await this.postTweet(tweet, burnType);
            
            // Mark this burn as tweeted by updating the burns.json file
            await this.markBurnAsTweeted(burn.id);
            
            console.log(`✅ Processed ${burnType} burn successfully and marked as tweeted`);
        } catch (error) {
            console.error(`Error processing burn ${burn.id}:`, error);
        }
    }

    async startBurnMonitoring() {
        console.log('👁️ Starting burn monitoring...');
        
        // Run an immediate check first
        console.log('\n⚡ Running immediate burn check on startup...');
        const untweetedBurns = this.getUntweetedBurns();
        
        if (untweetedBurns.length > 0) {
            console.log(`🔥 Found ${untweetedBurns.length} untweeted burn(s) to process on startup`);
            
            // Process burns in chronological order (oldest first)
            for (const burn of untweetedBurns) {
                await this.processBurn(burn);
                // Wait a bit between burns to avoid spam
                if (untweetedBurns.length > 1) {
                    console.log('⏳ Waiting 5 seconds before next burn...');
                    await new Promise(resolve => setTimeout(resolve, 5000));
                }
            }
        } else {
            console.log('✅ No untweeted burns found on startup');
        }
        
        // Set up the interval for regular checks
        let checkCount = 0;
        setInterval(async () => {
            checkCount++;
            const now = new Date().toISOString();
            console.log(`\n⏰ [${now}] Periodic burn check #${checkCount}`);
            
            const newUntweetedBurns = this.getUntweetedBurns();
            
            if (newUntweetedBurns.length > 0) {
                console.log(`🔥 Found ${newUntweetedBurns.length} untweeted burn(s) to process`);
                
                // Process burns in chronological order
                for (const burn of newUntweetedBurns) {
                    await this.processBurn(burn);
                    // Wait a bit between burns to avoid spam
                    if (newUntweetedBurns.length > 1) {
                        console.log('⏳ Waiting 5 seconds before next burn...');
                        await new Promise(resolve => setTimeout(resolve, 5000));
                    }
                }
            } else {
                console.log(`✅ No untweeted burns found in check #${checkCount}`);
            }
        }, 60000); // Check every minute
    }

    async run() {
        const isTestMode = process.env.TEST_MODE === 'true';
        const singleTweet = process.env.SINGLE_TWEET === 'true';
        const testType = process.env.TEST_TYPE || 'milestone';
        
        console.log(`🔥 Starting Simple Burn Bot... (${isTestMode ? 'TEST MODE' : 'LIVE MODE'})`);
        
        if (singleTweet) {
            console.log(`🎯 Single tweet test mode (${testType}) - generating one tweet then exiting`);
            try {
                let mockBurn;
                if (testType === 'milestone') {
                    mockBurn = {
                        milestone: 750000,
                        burnAmount: 15000000,
                        marketCapAtBurn: 750000,
                        txSignature: "2ixnzM3mHdVt9bM77bpYSAL9xr9z35AFaUaDCg7pV92zgbP2MRtSobWV6Pd9hibNc3zXguyEGNc4XDHaqmUY6Xrb",
                        details: {
                            percentOfSupply: 1.5
                        }
                    };
                } else {
                    // Buyback test
                    mockBurn = {
                        solSpent: 1.24,
                        burnAmount: 143218,
                        solSpentUsd: 494.10,
                        txSignature: "36hsSiwtq7MMx3WvwJqKHwkaz9FbhKBCwyuxoZJh7kA6ykWbkDMhZqZ57LjzLA1fydxRfmR2S2Cdu6M6wZD49ftm"
                    };
                }
                
                const burnType = testType === 'milestone' ? 'milestone' : 'buyback';
                const tweet = this.generateBurnMessage(burnType, mockBurn);
                
                await this.postTweet(tweet, testType);
                console.log(`\n✅ Single ${testType} tweet test completed!`);
                return;
            } catch (error) {
                console.error(`❌ Single ${testType} tweet test failed:`, error);
                return;
            }
        }

        // Start burn monitoring (no random tweets, only burn notifications)
        this.startBurnMonitoring();

        console.log('🔥 Simple Burn Bot is now monitoring for burns...');
        console.log('💡 This bot only posts when burns happen - no random tweets');
        
        // Keep the process running
        while (true) {
            await new Promise(resolve => setTimeout(resolve, 60000)); // Check every minute
        }
    }

    cleanup() {
        console.log('🔥 Simple Burn Bot cleanup completed');
        
        // Clean up the old state file if it exists (we don't need it anymore)
        try {
            const stateFile = path.join(__dirname, 'last-processed-burn.txt');
            if (fs.existsSync(stateFile)) {
                fs.unlinkSync(stateFile);
                console.log('🗑️ Removed old state file (no longer needed)');
            }
        } catch (error) {
            // Ignore cleanup errors
        }
    }
}

// Main entry point
let bot;

const main = async () => {
    bot = new SimpleBurnBot();
    try {
        await bot.run();
    } catch (error) {
        console.error('\n💥 Fatal error:', error);
        if (bot) bot.cleanup();
        process.exit(1);
    }
};

process.on('SIGINT', async () => {
    console.log('\n🔥 Shutting down Simple Burn Bot...');
    if (bot) bot.cleanup();
    process.exit(0);
});

main().catch(console.error);