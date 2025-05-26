// Create a new test file: src/twitter-agent/test-real-burns.js

const { TwitterApi } = require('twitter-api-v2');
const Anthropic = require('@anthropic-ai/sdk');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const { infernoPersonality, generateInfernoTweetPrompt, generateRandomPersonality } = require('./config/personality.js');

// Load environment variables
dotenv.config();

class BurnTester {
    constructor() {
        // Initialize Claude (Anthropic)
        this.anthropic = new Anthropic({
            apiKey: process.env.CLAUDE_API_KEY,
        });

        this.burnsFilePath = path.join(__dirname, '../../data/burns.json');
        this.getPersonalityPrompt = () => generateInfernoTweetPrompt(generateRandomPersonality());
        
        console.log('🧪 BURN TESTER - Testing real burns.json processing');
    }

    async generateTweet(type = 'random', context = null, burnData = null) {
        try {
            let prompt, systemPrompt;

            switch (type) {
                case 'milestone':
                    systemPrompt = this.getPersonalityPrompt();
                    
                    const milestoneAmount = burnData.milestone || burnData.marketCapAtBurn || 0;
                    const tokensDestroyed = Math.round(burnData.burnAmount);
                    const percentOfSupply = burnData.details?.percentOfSupply || 0;
                    const txHash = burnData.txSignature;
                    const shortTx = `${txHash.substring(0, 6)}...${txHash.substring(txHash.length - 4)}`;
                    const solscanLink = `https://solscan.io/tx/${txHash}`;
                    
                    prompt = `Generate a MILESTONE BURN announcement tweet (maximum 250 characters).
                            
                            REAL MILESTONE DATA:
                            - Milestone reached: $${milestoneAmount.toLocaleString()} market cap
                            - Tokens burned: ${tokensDestroyed.toLocaleString()} tokens
                            - Percentage of supply: ${percentOfSupply}%
                            - Transaction: ${shortTx}
                            - Solscan link: ${solscanLink}
                            
                            Include the transaction as a clickable link: ${solscanLink}
                            Express your mischievous delight about the destruction.
                            Maximum 250 characters total. Return ONLY the tweet text with the link.`;
                    break;

                case 'buyback':
                    systemPrompt = this.getPersonalityPrompt();
                    
                    const solSpent = parseFloat(burnData.solSpent || 0);
                    const tokensBurned = Math.round(burnData.burnAmount);
                    const usdValue = parseFloat(burnData.solSpentUsd || 0);
                    const txHash2 = burnData.txSignature;
                    const shortTx2 = `${txHash2.substring(0, 6)}...${txHash2.substring(txHash2.length - 4)}`;
                    const solscanLink2 = `https://solscan.io/tx/${txHash2}`;
                    
                    prompt = `Generate a BUYBACK BURN announcement tweet (maximum 250 characters).
                            
                            REAL BUYBACK DATA:
                            - SOL spent: ${solSpent} SOL
                            - USD value: $${usdValue.toFixed(2)}
                            - Tokens burned: ${tokensBurned.toLocaleString()} tokens
                            - Transaction: ${shortTx2}
                            - Solscan link: ${solscanLink2}
                            
                            Include the transaction as a clickable link: ${solscanLink2}
                            Express joy about the automated destruction.
                            Maximum 250 characters total. Return ONLY the tweet text with the link.`;
                    break;
            }

            const message = await this.anthropic.messages.create({
                model: "claude-3-5-sonnet-20241022",
                max_tokens: 200,
                temperature: 0.9,
                system: systemPrompt,
                messages: [{ role: "user", content: prompt }]
            });

            let tweet = message.content[0].text.trim();

            if (tweet.startsWith('"') && tweet.endsWith('"')) {
                tweet = tweet.slice(1, -1);
            }

            if (tweet.length > 250) {
                tweet = tweet.substring(0, 250);
            }

            return tweet;
        } catch (error) {
            console.error('Error generating tweet:', error);
            throw error;
        }
    }

    async markBurnAsTweeted(burnId) {
        try {
            if (!fs.existsSync(this.burnsFilePath)) {
                console.log('⚠️ Burns file does not exist');
                return false;
            }

            const burns = JSON.parse(fs.readFileSync(this.burnsFilePath, 'utf8'));
            
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
            
            fs.writeFileSync(this.burnsFilePath, JSON.stringify(updatedBurns, null, 2));
            
            console.log(`✅ Marked burn ${burnId} as tweeted in burns.json`);
            return true;
        } catch (error) {
            console.error(`❌ Error marking burn as tweeted:`, error);
            return false;
        }
    }

    async testProcessBurn(burnId = null) {
        try {
            if (!fs.existsSync(this.burnsFilePath)) {
                console.log('❌ Burns file not found at:', this.burnsFilePath);
                return;
            }

            const burns = JSON.parse(fs.readFileSync(this.burnsFilePath, 'utf8'));
            
            if (!Array.isArray(burns) || burns.length === 0) {
                console.log('❌ No burns found in file');
                return;
            }

            // If no specific burnId, find the first unprocessed burn
            let burnToProcess;
            if (burnId) {
                burnToProcess = burns.find(burn => burn.id === burnId);
                if (!burnToProcess) {
                    console.log(`❌ Burn with ID ${burnId} not found`);
                    return;
                }
            } else {
                // Find first burn without tweetPosted flag
                burnToProcess = burns.find(burn => !burn.tweetPosted);
                if (!burnToProcess) {
                    console.log('❌ No unprocessed burns found');
                    console.log('💡 All burns have already been tweeted');
                    return;
                }
            }

            console.log(`\n🔥 Testing burn processing for: ${burnToProcess.id}`);
            console.log(`📊 Burn type: ${burnToProcess.burnType}`);
            console.log(`📊 Amount: ${burnToProcess.burnAmount}`);
            console.log(`📊 TX: ${burnToProcess.txSignature}`);

            const burnType = burnToProcess.initiator === 'milestone-script' ? 'milestone' : 'buyback';
            
            console.log(`\n🎭 Generating ${burnType} tweet...`);
            const tweet = await this.generateTweet(burnType, null, burnToProcess);
            
            console.log(`\n✅ Generated tweet:`);
            console.log(`"${tweet}"`);
            console.log(`📏 Length: ${tweet.length}/280`);
            
            // Ask if user wants to mark as tweeted
            console.log(`\n❓ Mark this burn as tweeted in burns.json? (y/n)`);
            
            // In a real scenario, you'd want user input. For now, let's auto-mark:
            const shouldMark = process.env.AUTO_MARK === 'true';
            if (shouldMark) {
                const marked = await this.markBurnAsTweeted(burnToProcess.id);
                if (marked) {
                    console.log(`✅ Burn ${burnToProcess.id} marked as tweeted`);
                } else {
                    console.log(`❌ Failed to mark burn as tweeted`);
                }
            } else {
                console.log(`💡 To auto-mark burns as tweeted, set AUTO_MARK=true`);
            }

        } catch (error) {
            console.error('❌ Error testing burn processing:', error);
        }
    }

    async listBurns() {
        try {
            if (!fs.existsSync(this.burnsFilePath)) {
                console.log('❌ Burns file not found');
                return;
            }

            const burns = JSON.parse(fs.readFileSync(this.burnsFilePath, 'utf8'));
            
            console.log(`\n📊 Found ${burns.length} burns in burns.json:`);
            burns.forEach((burn, index) => {
                const status = burn.tweetPosted ? '✅ Tweeted' : '⏳ Pending';
                const type = burn.initiator === 'milestone-script' ? 'milestone' : 'buyback';
                console.log(`${index + 1}. ${burn.id} - ${type} - ${burn.burnAmount} tokens - ${status}`);
            });

        } catch (error) {
            console.error('❌ Error listing burns:', error);
        }
    }
}

// Main execution
const main = async () => {
    const tester = new BurnTester();
    const command = process.argv[2] || 'test';

    switch (command) {
        case 'list':
            await tester.listBurns();
            break;
        case 'test':
            const burnId = process.argv[3] || null;
            await tester.testProcessBurn(burnId);
            break;
        default:
            console.log(`
🧪 Burn Tester Commands:

node src/twitter-agent/test-real-burns.js list
  - List all burns in burns.json

node src/twitter-agent/test-real-burns.js test
  - Test processing the first unprocessed burn

node src/twitter-agent/test-real-burns.js test [burnId]
  - Test processing a specific burn by ID

Environment Variables:
AUTO_MARK=true - Automatically mark burns as tweeted after testing
            `);
    }
};

main().catch(console.error);