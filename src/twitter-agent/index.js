// src/twitter-agent/index.js
const { TwitterApi } = require('twitter-api-v2');
const Anthropic = require('@anthropic-ai/sdk');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const { infernoPersonality, generateInfernoTweetPrompt, generateRandomPersonality } = require('./config/personality.js');

// Load environment variables
dotenv.config();

class InfernoAgent {
    constructor() {
        this.checkEnvVars();
        
        // Initialize Twitter API (only if not in test mode)
        const isTestMode = process.env.TEST_MODE === 'true';
        
        if (!isTestMode) {
            this.twitter = new TwitterApi({
                appKey: process.env.TWITTER_API_KEY,
                appSecret: process.env.TWITTER_API_SECRET,
                accessToken: process.env.TWITTER_ACCESS_TOKEN,
                accessSecret: process.env.TWITTER_ACCESS_SECRET,
            });
        }

        // Initialize Claude (Anthropic)
        this.anthropic = new Anthropic({
            apiKey: process.env.CLAUDE_API_KEY,
        });

        this.tweetCount = 0;
        // Generate fresh personality prompt each time for more variety
        this.getPersonalityPrompt = () => generateInfernoTweetPrompt(generateRandomPersonality());
        
        // File monitoring
        this.burnsFilePath = path.join(__dirname, '../../data/burns.json');
        this.lastProcessedBurnId = null;
        this.loadLastProcessedBurn();
        
        console.log(`🔥 INFERNO Agent initialized - ${isTestMode ? 'TEST MODE' : 'LIVE MODE'} 🔥`);
        if (isTestMode) {
            console.log('💡 Running in TEST MODE - tweets will be generated but NOT posted to Twitter');
        }
    }

    checkEnvVars() {
        const isTestMode = process.env.TEST_MODE === 'true';
        
        let required = ['CLAUDE_API_KEY'];
        
        // Only require Twitter credentials if not in test mode
        if (!isTestMode) {
            required = required.concat([
                'TWITTER_API_KEY',
                'TWITTER_API_SECRET', 
                'TWITTER_ACCESS_TOKEN',
                'TWITTER_ACCESS_SECRET'
            ]);
        }

        const missing = required.filter(varName => !process.env[varName]);
        
        if (missing.length > 0) {
            console.error('❌ Missing environment variables:');
            missing.forEach(varName => console.error(`- ${varName}`));
            if (isTestMode) {
                console.log('💡 In TEST MODE, only CLAUDE_API_KEY is required');
            }
            throw new Error('Missing required environment variables');
        }

        console.log('✅ All required environment variables are present');
    }

    loadLastProcessedBurn() {
        try {
            const stateFile = path.join(__dirname, 'last-processed-burn.txt');
            if (fs.existsSync(stateFile)) {
                this.lastProcessedBurnId = fs.readFileSync(stateFile, 'utf8').trim();
                console.log(`📝 Loaded last processed burn ID: ${this.lastProcessedBurnId}`);
            }
        } catch (error) {
            console.log('📝 No previous burn state found, starting fresh');
        }
    }

    saveLastProcessedBurn(burnId) {
        try {
            const stateFile = path.join(__dirname, 'last-processed-burn.txt');
            fs.writeFileSync(stateFile, burnId);
            this.lastProcessedBurnId = burnId;
        } catch (error) {
            console.error('Error saving last processed burn:', error);
        }
    }

    async generateTweet(type = 'random', context = null, burnData = null) {
        try {
            const selectedStyle = this.getTweetStyle();
            console.log(`🎲 Selected tweet style: ${selectedStyle.type} (${selectedStyle.minLength}-${selectedStyle.maxLength} chars)`);

            let prompt, systemPrompt;

            switch (type) {
                case 'random':
                    // Generate fresh personality prompt each time for variety
                    systemPrompt = this.getPersonalityPrompt();
                    prompt = `Generate a ${selectedStyle.type} random tweet (between ${selectedStyle.minLength} and ${selectedStyle.maxLength} characters).
                            
                            ${context ? `Context: ${context}` : ''}
                            
                            IMPORTANT: Your response MUST:
                            1. Be between ${selectedStyle.minLength} and ${selectedStyle.maxLength} characters (including emojis)
                            2. Express your personality naturally without following rigid patterns
                            3. Can be cryptic, philosophical, observational, or playful
                            4. DO NOT add any signature or "INFERNO" at the end
                            5. Return ONLY the tweet text, no quotes or extra formatting
                            6. Be genuinely different from your previous tweets
                            7. Aim for the sweet spot of ${Math.round((selectedStyle.minLength + selectedStyle.maxLength) / 2)} characters`;
                    break;

                case 'milestone':
                    systemPrompt = this.getPersonalityPrompt();
                    
                    // Extract real data from burnData
                    const milestoneAmount = burnData.milestone || burnData.marketCapAtBurn || 0;
                    const tokensDestroyed = Math.round(burnData.burnAmount);
                    const percentOfSupply = burnData.details?.percentOfSupply || 0;
                    const txHash = burnData.txSignature;
                    const shortTx = `${txHash.substring(0, 6)}...${txHash.substring(txHash.length - 4)}`;
                    const solscanLink = `https://solscan.io/tx/${txHash}`;
                    
                    prompt = `Generate a MILESTONE BURN announcement tweet (between 180 and 250 characters).
                            
                            REAL MILESTONE DATA:
                            - Milestone reached: ${milestoneAmount.toLocaleString()} market cap
                            - Tokens burned: ${tokensDestroyed.toLocaleString()} tokens
                            - Percentage of supply: ${percentOfSupply}%
                            - Transaction: ${shortTx}
                            - Solscan link: ${solscanLink}
                            
                            IMPORTANT: Your response MUST:
                            1. Celebrate the milestone achievement with genuine joy
                            2. Mention the milestone amount (${milestoneAmount.toLocaleString()})
                            3. Include tokens burned (${tokensDestroyed.toLocaleString()})
                            4. Include the transaction as a clickable link: ${solscanLink}
                            5. Express your mischievous delight about the destruction
                            6. Use your playful, wise personality
                            7. Be between 180-250 characters total
                            8. Return ONLY the tweet text with the link`;
                    break;

                case 'buyback':
                    systemPrompt = this.getPersonalityPrompt();
                    
                    // Extract real data from burnData  
                    const solSpent = parseFloat(burnData.solSpent || 0);
                    const tokensBurned = Math.round(burnData.burnAmount);
                    const usdValue = parseFloat(burnData.solSpentUsd || 0);
                    const txHash2 = burnData.txSignature;
                    const shortTx2 = `${txHash2.substring(0, 6)}...${txHash2.substring(txHash2.length - 4)}`;
                    const solscanLink2 = `https://solscan.io/tx/${txHash2}`;
                    
                    prompt = `Generate a BUYBACK BURN announcement tweet (between 180 and 250 characters).
                            
                            REAL BUYBACK DATA:
                            - SOL spent: ${solSpent} SOL
                            - USD value: ${usdValue.toFixed(2)}
                            - Tokens burned: ${tokensBurned.toLocaleString()} tokens
                            - Transaction: ${shortTx2}
                            - Solscan link: ${solscanLink2}
                            
                            IMPORTANT: Your response MUST:
                            1. Celebrate the automatic buyback and burn
                            2. Include SOL spent (${solSpent} SOL) or USD value (${usdValue.toFixed(2)})
                            3. Include tokens burned (${tokensBurned.toLocaleString()})
                            4. Include the transaction as a clickable link: ${solscanLink2}
                            5. Express joy about the automated destruction
                            6. Use your mischievous, wise personality
                            7. Be between 180-250 characters total
                            8. Return ONLY the tweet text with the link`;
                    break;

                default:
                    systemPrompt = this.getPersonalityPrompt();
                    prompt = `Generate a ${selectedStyle.type} tweet (between ${selectedStyle.minLength} and ${selectedStyle.maxLength} characters).`;
            }

            const message = await this.anthropic.messages.create({
                model: "claude-3-5-sonnet-20241022",
                max_tokens: 200,
                temperature: 0.9,
                system: systemPrompt,
                messages: [{ role: "user", content: prompt }]
            });

            let tweet = message.content[0].text.trim();

            // Remove any quotes that Claude might add
            if (tweet.startsWith('"') && tweet.endsWith('"')) {
                tweet = tweet.slice(1, -1);
            }

            // Smart length handling with regeneration for overly long tweets
            const maxLength = type === 'random' ? selectedStyle.maxLength : 250;
            const minLength = type === 'random' ? selectedStyle.minLength : 180;
            
            // If tweet is way too long (250+), regenerate with stricter prompt
            if (tweet.length > 250) {
                console.log(`⚠️ Tweet way too long (${tweet.length}), regenerating with stricter limits...`);
                
                const strictPrompt = `Generate a shorter ${selectedStyle.type} tweet. MAXIMUM ${maxLength} characters. Be concise and punchy. ${type === 'random' ? 'Express one clear thought.' : 'Include the essential data and link only.'}`;
                
                const retryMessage = await this.anthropic.messages.create({
                    model: "claude-3-5-sonnet-20241022",
                    max_tokens: 150,
                    temperature: 0.7, // Lower temperature for more controlled output
                    system: systemPrompt,
                    messages: [{ role: "user", content: strictPrompt }]
                });
                
                tweet = retryMessage.content[0].text.trim();
                if (tweet.startsWith('"') && tweet.endsWith('"')) {
                    tweet = tweet.slice(1, -1);
                }
                
                console.log(`🔄 Regenerated tweet length: ${tweet.length}`);
            }
            
            // If still too long, do smart truncation
            if (tweet.length > maxLength) {
                console.log(`⚠️ Tweet still long (${tweet.length}), smart truncating to ${maxLength}...`);
                // Truncate at word boundary if possible
                const truncated = tweet.substring(0, maxLength - 3); // Reserve 3 chars for "..."
                const lastSpace = truncated.lastIndexOf(' ');
                tweet = lastSpace > maxLength * 0.8 ? truncated.substring(0, lastSpace) + '...' : truncated;
            }
            
            // For random tweets, if too short, just log (don't regenerate to avoid loops)
            if (tweet.length < minLength && type === 'random') {
                console.log(`ℹ️ Tweet shorter than target (${tweet.length} < ${minLength}) but posting anyway`);
            }

            console.log(`📏 Final tweet length: ${tweet.length} (target: ${minLength}-${maxLength})`);
            return tweet;
        } catch (error) {
            console.error('Error generating tweet:', error);
            throw error;
        }
    }

    getTweetStyle() {
        const styles = infernoPersonality.writingStyle.tweetStyles;
        const random = Math.random();
        let cumulative = 0;

        for (const [style, config] of Object.entries(styles)) {
            cumulative += config.frequency;
            if (random <= cumulative) {
                return { type: style, ...config };
            }
        }

        return { type: 'short', ...styles.short };
    }

    async postTweet(tweetText, tweetType = 'random') {
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
                console.log(`🔥 Posting ${tweetType} tweet...`);
                const tweet = await this.twitter.v2.tweet(tweetText);
                this.tweetCount++;
                console.log(`\n✅ ${tweetType.toUpperCase()} Tweet #${this.tweetCount} posted successfully:`);
                console.log(`"${tweetText}"`);
                console.log(`📏 Length: ${tweetText.length}/280`);
                return tweet;
            }
        } catch (error) {
            console.error('Error posting tweet:', error);
            throw error;
        }
    }

    checkForNewBurns() {
        try {
            if (!fs.existsSync(this.burnsFilePath)) {
                return [];
            }

            const burns = JSON.parse(fs.readFileSync(this.burnsFilePath, 'utf8'));
            
            if (!Array.isArray(burns) || burns.length === 0) {
                return [];
            }

            // Sort by timestamp to get newest first
            burns.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

            // Filter out burns that were already tweeted
            const untweetedBurns = burns.filter(burn => !burn.tweetPosted);

            // If no last processed burn, take the most recent untweeted one as starting point
            if (!this.lastProcessedBurnId && untweetedBurns.length > 0) {
                this.saveLastProcessedBurn(untweetedBurns[0].id);
                return [];
            }

            // Find new burns since last processed that haven't been tweeted
            const lastProcessedIndex = burns.findIndex(burn => burn.id === this.lastProcessedBurnId);
            
            if (lastProcessedIndex === -1) {
                // Last processed burn not found, process the most recent untweeted one
                return untweetedBurns.length > 0 ? [untweetedBurns[0]] : [];
            }

            // Return burns that are newer than the last processed one AND haven't been tweeted
            const newBurns = burns.slice(0, lastProcessedIndex).filter(burn => !burn.tweetPosted);
            
            return newBurns;
        } catch (error) {
            console.error('Error checking for new burns:', error);
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
            console.log(`\n🔥 Processing new ${burn.burnType} burn: ${burn.id}`);
            
            // Check if this burn was already tweeted
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
            
            const tweet = await this.generateTweet(burnType, null, burn);
            await this.postTweet(tweet, burnType);
            
            // Mark this burn as tweeted by updating the burns.json file
            await this.markBurnAsTweeted(burn.id);
            
            // Save this as the last processed burn
            this.saveLastProcessedBurn(burn.id);
            
            console.log(`✅ Processed ${burnType} burn successfully and marked as tweeted`);
        } catch (error) {
            console.error(`Error processing burn ${burn.id}:`, error);
        }
    }

    async startBurnMonitoring() {
        console.log('👁️ Starting burn file monitoring...');
        
        setInterval(async () => {
            const newBurns = this.checkForNewBurns();
            
            if (newBurns.length > 0) {
                console.log(`🔥 Found ${newBurns.length} new burn(s) to process`);
                
                // Process burns in chronological order (oldest first)
                const orderedBurns = newBurns.reverse();
                
                for (const burn of orderedBurns) {
                    await this.processBurn(burn);
                    // Wait a bit between burns to avoid spam
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }
        }, 60000); // Check every minute
    }

    async run(intervalMinutes = 45) {
        const isTestMode = process.env.TEST_MODE === 'true';
        const singleTweet = process.env.SINGLE_TWEET === 'true';
        const testType = process.env.TEST_TYPE || 'random';
        
        console.log(`🔥 Starting INFERNO Agent... (${isTestMode ? 'TEST MODE' : 'LIVE MODE'})`);
        
        if (singleTweet) {
            console.log(`🎯 Single tweet test mode (${testType}) - generating one tweet then exiting`);
            try {
                let tweet;
                if (testType === 'milestone') {
                    // Use real data from your burns.json or create realistic mock
                    const mockBurn = {
                        milestone: 5000,
                        burnAmount: 10,
                        marketCapAtBurn: 5000,
                        txSignature: "2ixnzM3mHdVt9bM77bpYSAL9xr9z35AFaUaDCg7pV92zgbP2MRtSobWV6Pd9hibNc3zXguyEGNc4XDHaqmUY6Xrb",
                        details: {
                            percentOfSupply: 2.5,
                            milestoneName: "$5,000 Market Cap"
                        }
                    };
                    tweet = await this.generateTweet('milestone', null, mockBurn);
                } else if (testType === 'buyback') {
                    // Use real data from your burns.json or create realistic mock
                    const mockBurn = {
                        solSpent: 0.00047047325,
                        burnAmount: 15139.295817,
                        solSpentUsd: 0.0495235,
                        txSignature: "36hsSiwtq7MMx3WvwJqKHwkaz9FbhKBCwyuxoZJh7kA6ykWbkDMhZqZ57LjzLA1fydxRfmR2S2Cdu6M6wZD49ftm"
                    };
                    tweet = await this.generateTweet('buyback', null, mockBurn);
                } else {
                    tweet = await this.generateTweet('random');
                }
                
                await this.postTweet(tweet, testType);
                console.log(`\n✅ Single ${testType} tweet test completed!`);
                return;
            } catch (error) {
                console.error(`❌ Single ${testType} tweet test failed:`, error);
                return;
            }
        }

        // Start burn monitoring
        this.startBurnMonitoring();

        console.log(`⏰ Random tweet interval: ${intervalMinutes} minutes`);

        // Post initial tweet
        try {
            const initialTweet = await this.generateTweet('random');
            await this.postTweet(initialTweet, 'random');
        } catch (error) {
            console.error('Failed to post initial tweet:', error);
        }

        while (true) {
            try {
                const tweet = await this.generateTweet('random');
                await this.postTweet(tweet, 'random');

                const nextTweetDate = new Date(Date.now() + intervalMinutes * 60 * 1000);
                console.log(`\n🔥 Next random tweet scheduled for: ${nextTweetDate.toLocaleString()}`);
                console.log('------------------------');
                
                await new Promise(resolve => setTimeout(resolve, intervalMinutes * 60 * 1000));
            } catch (error) {
                console.error('\n❌ Error occurred:', error);
                
                console.log('⏳ Waiting 5 minutes before retry...');
                await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000));
            }
        }
    }

    cleanup() {
        console.log('🔥 INFERNO Agent cleanup completed - The burns will continue...');
    }
}

// Main entry point
let agent;

const main = async () => {
    agent = new InfernoAgent();
    try {
        await agent.run(45);  // Random tweet every 45 minutes
    } catch (error) {
        console.error('\n💥 Fatal error:', error);
        if (agent) agent.cleanup();
        process.exit(1);
    }
};

process.on('SIGINT', async () => {
    console.log('\n🔥 Shutting down INFERNO Agent...');
    if (agent) agent.cleanup();
    process.exit(0);
});

main().catch(console.error);