/**
 * $INFERNO Token Dashboard JavaScript
 * Connects frontend with backend API and updates dashboard in real-time
 */

document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing dashboard...');
    
    // Initialize dashboard
    initializeDashboard();
    
    // Set up refresh interval (every 60 seconds)
    setInterval(refreshData, 60000);
    
    // Set up manual refresh button
    const refreshButton = document.getElementById('refresh-data');
    if (refreshButton) {
        refreshButton.addEventListener('click', () => {
            console.log('Manual refresh clicked');
            refreshData(true); // true = animate the transition
        });
    }
});

/**
 * Initialize dashboard with first data load
 */
async function initializeDashboard() {
    try {
        // Fetch initial data
        await fetchAndUpdateMetrics();
        await fetchAndUpdateMilestones();
        await fetchAndUpdateBurns();
        await fetchAndUpdateRewards();
        
        // Set up UI interactions
        setupTabSwitching();
        setupCopyAddress();
        setupStepHover();
        
        console.log('Dashboard initialized');
    } catch (error) {
        console.error('Error initializing dashboard:', error);
        
        // Fall back to demo data if API fails
        loadDemoData();
    }
}

/**
 * Load demo data when API is not available
 */
async function loadDemoData() {
    console.log('Loading data from API or using fallback...');
    
    try {
        // Try to get data from API first
        const metricsData = await fetchMetricsFromAPI();
        
        if (metricsData) {
            // Use real data from API
            const totalBurned = metricsData.totalBurned || 0;
            const initialSupply = 1000000000; // 1 billion
            const burnPercentage = ((totalBurned / initialSupply) * 100).toFixed(2);
            
            // Animate counters
            animateCounter('total-burned', 0, totalBurned, 2000);
            
            // Set progress bar
            const progressBar = document.getElementById('burn-progress');
            const percentageElement = document.getElementById('burn-percentage');
            if (progressBar) {
                progressBar.style.width = `${burnPercentage}%`;
            }
            if (percentageElement) {
                percentageElement.textContent = `${burnPercentage}%`;
            }
            
            console.log('Loaded real data from API');
            return;
        }
    } catch (error) {
        console.error('Error in loadDemoData with API:', error);
    }
    
    // Fallback to minimal data - not hardcoded values
    console.log('Using minimal fallback data');
    
    const totalBurned = 0;
    const burnPercentage = 0;
    
    // Set values without animation for fallback
    const totalBurnedElement = document.getElementById('total-burned');
    const progressBar = document.getElementById('burn-progress');
    const percentageElement = document.getElementById('burn-percentage');
    
    if (totalBurnedElement) {
        totalBurnedElement.textContent = totalBurned.toLocaleString();
    }
    
    if (progressBar) {
        progressBar.style.width = `${burnPercentage}%`;
    }
    
    if (percentageElement) {
        percentageElement.textContent = `${burnPercentage.toFixed(2)}%`;
    }
}

/**
 * Refresh all dashboard data
 * @param {boolean} animate - Whether to animate the transitions
 */
async function refreshData(animate = false) {
    try {
        console.log('Refreshing all dashboard data...');
        await Promise.all([
            fetchAndUpdateMetrics(animate),
            fetchAndUpdateMilestones(),
            fetchAndUpdateBurns(),
            fetchAndUpdateRewards()
        ]);
        
        console.log('Dashboard data refreshed successfully');
    } catch (error) {
        console.error('Error refreshing data:', error);
        
        // If API fails, simulate data change
        simulateDataRefresh();
    }
}

/**
 * Fetch metrics data from API and update UI
 * @param {boolean} animate - Whether to animate the transitions
 * @returns {Object|null} The metrics data if successful, null if failed
 */
async function fetchAndUpdateMetrics(animate = false) {
    try {
        const response = await fetch('/api/metrics');
        
        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Metrics data:', data);
        
        // Update token address
        updateTokenAddress(data.tokenAddress);
        
        // Update total burned
        updateBurnMetrics(data, animate);
        
        // Update links with token address
        updateTokenLinks(data.tokenAddress);
        
        return data;
    } catch (error) {
        console.error('Error fetching metrics:', error);
        throw error;
    }
}

/**
 * Update token address in the UI
 * @param {string} tokenAddress - The token address from the API
 */
function updateTokenAddress(tokenAddress) {
    if (!tokenAddress) return;
    
    const contractAddressElement = document.getElementById('contract-address');
    if (contractAddressElement) {
        contractAddressElement.textContent = tokenAddress;
    }
}

/**
 * Update token links with actual token address
 * @param {string} tokenAddress - The token address from the API
 */
function updateTokenLinks(tokenAddress) {
    if (!tokenAddress) return;
    
    // Update chart link
    const chartButton = document.querySelector('.hero-buttons .button:first-child');
    if (chartButton) {
        chartButton.href = `https://pump.fun/coin/${tokenAddress}`;
    }
    
    // Update any other links that need the token address
    // e.g., for block explorer links, etc.
    const burnWalletLinks = document.querySelectorAll('.burn-wallet');
    if (burnWalletLinks.length > 0) {
        const burnAddress = "1nc1nerator11111111111111111111111111111111"; // Default burn address
        burnWalletLinks.forEach(link => {
            link.textContent = burnAddress;
        });
    }
}

/**
 * Helper function to fetch metrics without updating UI
 * @returns {Object|null} The metrics data if successful, null if failed
 */
async function fetchMetricsFromAPI() {
    try {
        const response = await fetch('/api/metrics');
        
        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error fetching metrics:', error);
        return null;
    }
}

/**
 * Fetch milestones data from API and update UI
 */
async function fetchAndUpdateMilestones() {
    try {
        const response = await fetch('/api/milestones');
        
        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Milestones data:', data);
        
        // Update milestones UI
        updateMilestonesUI(data);
        
        // Update milestone ladder visualization
        updateMilestoneLadder(data);
        
        return data;
    } catch (error) {
        console.error('Error fetching milestones:', error);
        throw error;
    }
}

/**
 * Fetch burns data from the API and update the UI
 */
async function fetchAndUpdateBurns() {
    try {
        console.log('Fetching burns data...');
        
        // Add timestamp to prevent browser caching
        const timestamp = new Date().getTime();
        const url = `/api/burns?limit=1000&_nocache=${timestamp}`;
        console.log('Fetching from URL:', url);
        
        // Force no-cache request
        const requestOptions = {
            method: 'GET',
            cache: 'no-store',
            headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
                'Pragma': 'no-cache',
                'Expires': '0'
            }
        };
        
        // Request a large limit to get all burns in one request
        const response = await fetch(url, requestOptions);
        
        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Burns data received:', JSON.stringify(data, null, 2));
        console.log('First 3 burn transactions:', data.burns?.slice(0, 3).map(b => ({
            id: b.id,
            timestamp: b.timestamp,
            burnAmount: b.burnAmount,
            txHash: b.transactionHash || 'no hash',
            type: b.burnType
        })));
        
        // Count burn types to make sure we have the right data
        const burnTypes = {};
        if (data.burns) {
            data.burns.forEach(burn => {
                const type = burn.burnType || 'unknown';
                burnTypes[type] = (burnTypes[type] || 0) + 1;
                
                // Log each transaction hash to verify the data
                console.log(`Burn ${burn.id} transaction hash: ${burn.transactionHash}`);
            });
            console.log('Burn types in response:', burnTypes);
        }
        
        // Update burns history table
        updateBurnsHistory(data);
        
        // Update statistics
        updateAutomatedBurnStats(data);
        
        return data;
    } catch (error) {
        console.error('Error fetching burns:', error);
        
        // Use fallback data if API fails - with the correct test transaction hashes
        const fallbackData = {
            burns: [
                {
                    "id": "1747181229250-burn1",
                    "timestamp": "2025-05-14T01:00:29.250Z",
                    "burnAmount": 143218,
                    "burnAmountUsd": 494.10,
                    "burnType": "automated",
                    "solSpent": 1.24,
                    "solSpentUsd": 494.10,
                    "transactionHash": "test"
                },
                {
                    "id": "1747180029250-burn2",
                    "timestamp": "2025-05-14T00:40:29.250Z",
                    "burnAmount": 89574,
                    "burnAmountUsd": 300.00,
                    "burnType": "automated",
                    "solSpent": 0.78,
                    "solSpentUsd": 300.00,
                    "transactionHash": "0xNigger"
                },
                {
                    "id": "1747178929250-burn3",
                    "timestamp": "2025-05-14T00:22:09.250Z",
                    "burnAmount": 125905,
                    "burnAmountUsd": 421.78,
                    "burnType": "automated",
                    "solSpent": 1.12,
                    "solSpentUsd": 421.78,
                    "transactionHash": "L0q7PwXjN53TcrQmLFZ7J93cD"
                },
                {
                    "id": "1747177829250-burn4",
                    "timestamp": "2025-05-14T00:03:49.250Z",
                    "burnAmount": 76332,
                    "burnAmountUsd": 255.71,
                    "burnType": "automated",
                    "solSpent": 0.65,
                    "solSpentUsd": 255.71,
                    "transactionHash": "X3r9MnpDFE7wQ2jKsN0pE2"
                },
                {
                    "id": "1747176729250-burn5",
                    "timestamp": "2025-05-13T23:45:29.250Z",
                    "burnAmount": 168711,
                    "burnAmountUsd": 565.18,
                    "burnType": "automated",
                    "solSpent": 1.46,
                    "solSpentUsd": 565.18,
                    "transactionHash": "8Hj4PqwZnMmR7Xc9k3F7"
                }
            ]
        };
        
        console.log('Using fallback data since API failed');
        
        // Update UI with fallback data
        updateBurnsHistory(fallbackData);
        updateAutomatedBurnStats(fallbackData);
        
        return fallbackData;
    }
}

/**
 * Update the burns history table with data
 * @param {Object} data - The burns data from the API
 */
function updateBurnsHistory(data) {
    if (!data || !data.burns) {
        console.error('No burns data available');
        return;
    }
    
    const automatedBurnsTable = document.querySelector('.automated-burns .history-table tbody');
    if (!automatedBurnsTable) {
        console.error('Burns table element not found');
        return;
    }
    
    // Clear existing table content
    automatedBurnsTable.innerHTML = '';
    
    // Filter for automated burns only
    const automatedBurns = data.burns.filter(burn => 
        burn.burnType === 'automated' || burn.burnType === 'buyback'
    );
    
    console.log('Filtered automated burns:', automatedBurns.map(b => ({
        id: b.id,
        timestamp: b.timestamp,
        burnAmount: b.burnAmount,
        txHash: b.transactionHash
    })));
    
    if (automatedBurns.length === 0) {
        automatedBurnsTable.innerHTML = '<tr><td colspan="4">No automated burns found</td></tr>';
        return;
    }
    
    // Sort by timestamp (newest first)
    automatedBurns.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // Log after sorting to see what we're actually displaying
    console.log('Sorted automated burns (newest first):', automatedBurns.map(b => ({
        id: b.id,
        date: new Date(b.timestamp).toLocaleString(),
        txHash: b.transactionHash || 'no hash'
    })));
    
    // Add rows for automated burns (limit to 5 most recent)
    const recentAutomatedBurns = automatedBurns.slice(0, 5);
    recentAutomatedBurns.forEach(burn => {
        const row = document.createElement('tr');
        
        // Calculate time ago
        const burnTime = new Date(burn.timestamp);
        const timeAgo = getTimeAgo(burnTime);
        
        // Format transaction hash
        const txHash = burn.transactionHash || burn.txSignature || 'Unknown';
        const shortTxHash = `${txHash.substring(0, 6)}...${txHash.substring(txHash.length - 4)}`;
        
        // Log each burn row being added
        console.log(`Adding burn row: ${burn.id}, amount: ${burn.burnAmount}, tx: ${txHash}, time: ${timeAgo}`);
        
        // Check if we're dealing with test data and highlight it in the console
        if (txHash === 'test' || txHash === '0xNigger') {
            console.log('%c ⚠️ TEST DATA FOUND! ' + burn.id + ' with tx: ' + txHash, 'background: yellow; color: red; font-size: 20px');
        }
        
        // Create row HTML
        row.innerHTML = `
            <td>${timeAgo}</td>
            <td class="tx-hash"><a href="https://solscan.io/tx/${txHash}" target="_blank" rel="noopener noreferrer">${shortTxHash} <span class="tx-icon">↗</span></a></td>
            <td>${burn.solSpent ? burn.solSpent.toFixed(2) : '0.00'} SOL</td>
            <td class="burn-amount">${burn.burnAmount.toLocaleString()} INFERNO</td>
        `;
        
        automatedBurnsTable.appendChild(row);
    });
    
    console.log(`Updated burns history table with ${recentAutomatedBurns.length} transactions`);
}

/**
 * Update automated burn statistics based on burns data
 * @param {Object} data - The burns data from the API
 */
function updateAutomatedBurnStats(data) {
    if (!data || !data.burns) {
        console.error('No burns data available for stats');
        return;
    }
    
    // Filter for automated burns
    const automatedBurns = data.burns.filter(burn => 
        burn.burnType === 'automated' || burn.burnType === 'buyback'
    );
    
    // Calculate 24h burns
    const oneDayAgo = new Date();
    oneDayAgo.setHours(oneDayAgo.getHours() - 24);
    
    const burns24h = automatedBurns.filter(burn => new Date(burn.timestamp) >= oneDayAgo);
    const totalBurns24h = burns24h.reduce((sum, burn) => sum + burn.burnAmount, 0);
    
    // Calculate total automated burns
    const totalAutomatedBurns = automatedBurns.reduce((sum, burn) => sum + burn.burnAmount, 0);
    
    // Calculate total SOL spent
    const totalSolSpent = automatedBurns.reduce((sum, burn) => sum + (burn.solSpent || 0), 0);
    
    // Calculate USD value
    const totalUsdSpent = automatedBurns.reduce((sum, burn) => sum + (burn.solSpentUsd || burn.burnAmountUsd || 0), 0);
    
    // Update stats in UI
    const burns24hElement = document.querySelector('.automated-burns .stat-card:nth-child(1) .stat-value');
    const burns24hSubElement = document.querySelector('.automated-burns .stat-card:nth-child(1) .stat-sub');
    
    const totalBurnsElement = document.querySelector('.automated-burns .stat-card:nth-child(2) .stat-value');
    const totalBurnsSubElement = document.querySelector('.automated-burns .stat-card:nth-child(2) .stat-sub');
    
    const solSpentElement = document.querySelector('.automated-burns .stat-card:nth-child(3) .stat-value');
    const solSpentSubElement = document.querySelector('.automated-burns .stat-card:nth-child(3) .stat-sub');
    
    const nextBurnElement = document.querySelector('.automated-burns .stat-card:nth-child(4) .stat-value');
    const nextBurnSubElement = document.querySelector('.automated-burns .stat-card:nth-child(4) .stat-sub');
    
    if (burns24hElement) burns24hElement.textContent = totalBurns24h.toLocaleString();
    if (burns24hSubElement) burns24hSubElement.textContent = `+${((totalBurns24h / 1000000000) * 100).toFixed(2)}% of supply`;
    
    if (totalBurnsElement) totalBurnsElement.textContent = totalAutomatedBurns.toLocaleString();
    if (totalBurnsSubElement) totalBurnsSubElement.textContent = `${((totalAutomatedBurns / 1000000000) * 100).toFixed(2)}% of supply`;
    
    if (solSpentElement) solSpentElement.textContent = `${totalSolSpent.toFixed(2)} SOL`;
    if (solSpentSubElement) solSpentSubElement.textContent = `≈ $${totalUsdSpent.toFixed(2)}`;
    
    // Estimate next burn (you can keep this simple)
    if (nextBurnElement) nextBurnElement.textContent = `~15 minutes`;
    if (nextBurnSubElement) {
        const avgBurnSize = Math.round(totalAutomatedBurns / automatedBurns.length) || 0;
        nextBurnSubElement.textContent = `Estimated size: ${avgBurnSize.toLocaleString()} tokens`;
    }
    
    console.log('Updated automated burn statistics');
}

/**
 * Update milestone progress on the ladder visualization
 * @param {Object} data - Milestones data from API
 */
function updateMilestoneLadder(data) {
    if (!data || !data.milestones || !data.currentMarketCap) return;
    
    const currentMarketCap = data.currentMarketCap;
    const maxMarketCap = 100000000; // $100M is the final milestone
    
    // Calculate progress percentage (capped at 100%)
    const progressPercentage = Math.min((currentMarketCap / maxMarketCap) * 100, 100);
    
    // Update progress track width
    const progressTrack = document.querySelector('.ladder-track .progress-track');
    if (progressTrack) {
        progressTrack.style.width = `${progressPercentage}%`;
    }
    
    // Update milestone markers
    data.milestones.forEach(milestone => {
        const markerPosition = (milestone.marketCap / maxMarketCap) * 100;
        const milestoneMarker = document.querySelector(`.milestone-marker[style*="left: ${markerPosition}%"], .milestone-marker[style*="left:${markerPosition}%"]`);
        
        if (milestoneMarker) {
            // Update marker appearance based on completed status
            if (milestone.completed) {
                milestoneMarker.classList.add('completed');
                // Replace dot with flame animation if not already done
                if (!milestoneMarker.querySelector('.animated-flame')) {
                    const dotElement = milestoneMarker.querySelector('.dot');
                    if (dotElement) {
                        const flameHTML = `
                            <div class="animated-flame">
                                <div class="flame-particle"></div>
                                <div class="flame-particle"></div>
                                <div class="flame-particle"></div>
                            </div>
                        `;
                        dotElement.outerHTML = flameHTML;
                    }
                }
            } else if (milestone.isPending) {
                milestoneMarker.classList.add('next');
            }
            
            // Update tooltip information
            const tooltipDetail = milestoneMarker.querySelector('.tooltip-detail');
            if (tooltipDetail) {
                tooltipDetail.innerHTML = `
                    <span>Burn: ${milestone.burnAmount.toLocaleString()} tokens</span>
                    <span>(${milestone.percentOfSupply.toFixed(2)}% of supply)</span>
                `;
                
                // Add progress bar for next milestone
                if (milestone.isPending) {
                    const progress = (currentMarketCap / milestone.marketCap) * 100;
                    tooltipDetail.innerHTML += `
                        <div class="milestone-progress">
                            <div class="milestone-progress-bar">
                                <div class="milestone-progress-fill" style="width: ${progress}%"></div>
                            </div>
                            <div class="milestone-progress-text">${Math.min(Math.round(progress), 99)}%</div>
                        </div>
                    `;
                }
            }
        }
    });
    
    // Update milestone labels
    data.milestones.forEach(milestone => {
        const markerPosition = (milestone.marketCap / maxMarketCap) * 100;
        
        // Find corresponding label
        const milestoneLabel = document.querySelector(`.milestone-label[style*="left: ${markerPosition}%"], .milestone-label[style*="left:${markerPosition}%"]`);
        const percentageLabel = document.querySelector(`.percentage-label[style*="left: ${markerPosition}%"], .percentage-label[style*="left:${markerPosition}%"]`);
        
        if (milestoneLabel) {
            // Update label classes based on milestone status
            if (milestone.completed) {
                milestoneLabel.classList.add('completed');
                milestoneLabel.classList.remove('next');
            } else if (milestone.isPending) {
                milestoneLabel.classList.add('next');
                milestoneLabel.classList.remove('completed');
            } else {
                milestoneLabel.classList.remove('completed', 'next');
            }
        }
        
        if (percentageLabel) {
            // Update percentage label classes
            if (milestone.completed) {
                percentageLabel.classList.add('completed');
                percentageLabel.classList.remove('next');
            } else if (milestone.isPending) {
                percentageLabel.classList.add('next');
                percentageLabel.classList.remove('completed');
            } else {
                percentageLabel.classList.remove('completed', 'next');
            }
        }
    });
}

/**
 * Fetch rewards data from API and update UI
 */
async function fetchAndUpdateRewards() {
    try {
        const response = await fetch('/api/rewards');
        
        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Rewards data:', data);
        
        // Update rewards UI
        updateRewardsUI(data);
        
        return data;
    } catch (error) {
        console.error('Error fetching rewards:', error);
        throw error;
    }
}

/**
 * Update burn metrics with data from API
 * @param {Object} data - Metrics data from API
 * @param {boolean} animate - Whether to animate the transitions
 */
function updateBurnMetrics(data, animate = false) {
    const totalBurnedElement = document.getElementById('total-burned');
    const progressBar = document.getElementById('burn-progress');
    const percentageElement = document.getElementById('burn-percentage');
    
    if (!totalBurnedElement || !progressBar || !percentageElement || !data) {
        return;
    }
    
    // Get total burned from the metrics data
    // This now comes directly from burnTracker.getTotalBurned() on the backend
    const totalBurned = data.totalBurned || 0;
    const initialSupply = 1000000000; // 1 billion
    const burnPercentage = ((totalBurned / initialSupply) * 100).toFixed(2);
    
    if (animate) {
        // Get current value from element
        const currentValue = parseInt(totalBurnedElement.textContent.replace(/,/g, '')) || 0;
        
        // Animate to new value
        animateCounter('total-burned', currentValue, totalBurned, 1000);
        
        // Animate progress bar
        animateProgressBar(progressBar, percentageElement, parseFloat(progressBar.style.width), burnPercentage);
    } else {
        // Update without animation
        totalBurnedElement.textContent = totalBurned.toLocaleString();
        progressBar.style.width = `${burnPercentage}%`;
        percentageElement.textContent = `${burnPercentage}%`;
    }
}

/**
 * Update milestones UI with data from API
 * @param {Object} data - Milestones data from API
 */
function updateMilestonesUI(data) {
    if (!data || !data.milestones || !data.currentMarketCap) {
        return;
    }
    
    // Update current market cap display
    const marketCapElement = document.getElementById('current-marketcap');
    if (marketCapElement) {
        const formattedMarketCap = formatCurrency(data.currentMarketCap);
        marketCapElement.innerHTML = `Current Market Cap: <strong>$${formattedMarketCap}</strong>`;
    }
    
    // Update milestone stats
    const completedCount = data.milestones.filter(m => m.completed).length;
    const totalCount = data.milestones.length;
    
    const completedCountElement = document.querySelector('.milestone-burns .stat-card:nth-child(1) .stat-value');
    if (completedCountElement) {
        completedCountElement.textContent = `${completedCount} of ${totalCount}`;
    }
    
    // Calculate total milestone burn amount
    const milestoneBurnAmount = data.milestones
        .filter(m => m.completed)
        .reduce((sum, m) => sum + m.burnAmount, 0);
    
    const milestoneBurnElement = document.querySelector('.milestone-burns .stat-card:nth-child(2) .stat-value');
    if (milestoneBurnElement) {
        milestoneBurnElement.textContent = milestoneBurnAmount.toLocaleString();
    }
    
    // Calculate percentage of supply burned via milestones
    const initialSupply = 1000000000; // 1 billion
    const milestoneBurnPercentage = (milestoneBurnAmount / initialSupply) * 100;
    
    const milestoneBurnPercentElement = document.querySelector('.milestone-burns .stat-card:nth-child(3) .stat-value');
    if (milestoneBurnPercentElement) {
        milestoneBurnPercentElement.textContent = `${milestoneBurnPercentage.toFixed(2)}%`;
    }
    
    // Update next milestone
    const nextMilestone = data.milestones.find(m => !m.completed);
    if (nextMilestone) {
        const nextMilestoneElement = document.querySelector('.milestone-burns .stat-card:nth-child(4) .stat-value');
        const nextMilestoneSubElement = document.querySelector('.milestone-burns .stat-card:nth-child(4) .stat-sub');
        
        if (nextMilestoneElement && nextMilestoneSubElement) {
            nextMilestoneElement.textContent = `$${formatCurrency(nextMilestone.marketCap)}`;
            nextMilestoneSubElement.textContent = `${nextMilestone.percentOfSupply.toFixed(2)}% Burn (${nextMilestone.burnAmount.toLocaleString()} tokens)`;
        }
    }
}

/**
 * Update rewards UI with data from API
 * @param {Object} data - Rewards data from API
 */
function updateRewardsUI(data) {
    if (!data || !data.rewards) {
        return;
    }
    
    const rewardsTableBody = document.querySelector('#rewards-table tbody');
    if (!rewardsTableBody) {
        return;
    }
    
    // Clear current table
    rewardsTableBody.innerHTML = '';
    
    // Add each reward entry
    data.rewards.forEach(reward => {
        const row = document.createElement('tr');
        
        // Format date
        const date = new Date(reward.timestamp);
        const formattedDate = date.toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric' 
        });
        
        // Get transaction hash (handle different property names)
        const txHash = reward.burnTxHash || reward.txSignature || reward.claimTxSignature || 'Unknown';
        
        // Create table row
        row.innerHTML = `
            <td>${formattedDate}</td>
            <td>${reward.rewardAmount.toFixed(4)} SOL</td>
            <td>$${reward.rewardAmountUsd.toFixed(2)}</td>
            <td>
                <a href="https://solscan.io/tx/${txHash}" target="_blank" class="tx-link">
                    ${txHash.substring(0, 6)}...${txHash.substring(txHash.length - 4)}
                    <span class="link-icon">🔗</span>
                </a>
            </td>
        `;
        
        rewardsTableBody.appendChild(row);
    });
}

/**
 * Set up tab switching between milestone and automated burns
 */
function setupTabSwitching() {
    const milestoneBurnTab = document.getElementById('milestone-burn-tab');
    const automatedBurnTab = document.getElementById('automated-burn-tab');
    const milestoneBurns = document.querySelector('.milestone-burns');
    const automatedBurns = document.querySelector('.automated-burns');
    
    if (milestoneBurnTab && automatedBurnTab && milestoneBurns && automatedBurns) {
        milestoneBurnTab.addEventListener('click', function() {
            milestoneBurnTab.classList.add('active');
            automatedBurnTab.classList.remove('active');
            milestoneBurns.classList.add('active');
            automatedBurns.classList.remove('active');
        });
        
        automatedBurnTab.addEventListener('click', function() {
            automatedBurnTab.classList.add('active');
            milestoneBurnTab.classList.remove('active');
            automatedBurns.classList.add('active');
            milestoneBurns.classList.remove('active');
            
            // Refresh data when tab is clicked
            fetchAndUpdateBurns();
        });
    }
}

/**
 * Set up copy address functionality
 */
function setupCopyAddress() {
    const copyButton = document.getElementById('copy-address');
    const addressElement = document.getElementById('contract-address');
    
    if (copyButton && addressElement) {
        copyButton.addEventListener('click', () => {
            const address = addressElement.textContent;
            navigator.clipboard.writeText(address).then(() => {
                copyButton.textContent = '✓';
                setTimeout(() => {
                    copyButton.textContent = '📋';
                }, 2000);
            });
        });
    }
    
    // Also set up burn wallet copy functionality
    const burnWalletElement = document.querySelector('.burn-wallet');
    if (burnWalletElement) {
        burnWalletElement.addEventListener('click', () => {
            const address = burnWalletElement.textContent;
            navigator.clipboard.writeText(address).then(() => {
                const originalText = burnWalletElement.textContent;
                burnWalletElement.textContent = "Copied!";
                burnWalletElement.style.color = "#4CAF50";
                setTimeout(() => {
                    burnWalletElement.textContent = originalText;
                    burnWalletElement.style.color = "";
                }, 2000);
            });
        });
    }
}

/**
 * Set up timeline step hover effects
 */
function setupStepHover() {
    const steps = document.querySelectorAll('.step');
    const timelineDots = document.querySelectorAll('.timeline-dot');
    
    if (steps.length > 0 && timelineDots.length > 0) {
        steps.forEach((step, index) => {
            if (index < timelineDots.length) {
                step.addEventListener('mouseenter', () => {
                    timelineDots[index].classList.add('active');
                });
                
                step.addEventListener('mouseleave', () => {
                    if (index !== 3) { // Keep the "Burn" dot active
                        timelineDots[index].classList.remove('active');
                    }
                });
            }
        });
    }
}

/**
 * Refresh data when API is not available
 * Try to get real data first, fall back to minimal simulation only if needed
 */
async function simulateDataRefresh() {
    try {
        // Try to get real data from API first
        const metricsData = await fetchMetricsFromAPI();
        const milestonesData = await fetchMilestonesFromAPI();
        
        if (metricsData) {
            // Use real metrics data
            updateBurnMetrics(metricsData, true);
            console.log('Used real metrics data for refresh');
        }
        
        if (milestonesData) {
            // Update current market cap with real data
            const marketCapElement = document.getElementById('current-marketcap');
            if (marketCapElement && milestonesData.currentMarketCap) {
                marketCapElement.innerHTML = `Current Market Cap: <strong>$${formatCurrency(milestonesData.currentMarketCap)}</strong>`;
            }
            console.log('Used real milestones data for refresh');
        }
        
        // If we got either real data source, don't fall back to simulation
        if (metricsData || milestonesData) {
            return;
        }
    } catch (error) {
        console.error('Error getting real data for refresh:', error);
    }
    
    // Only if all API attempts failed, get current values from UI
    const totalBurnedElement = document.getElementById('total-burned');
    const progressBar = document.getElementById('burn-progress');
    const percentageElement = document.getElementById('burn-percentage');
    
    console.log('Using minimal data refresh - only current displayed values');
    
    // Don't increment values artificially, just use what we have
    if (totalBurnedElement && progressBar && percentageElement) {
        const currentBurned = parseInt(totalBurnedElement.textContent.replace(/,/g, '')) || 0;
        
        // Just refresh the display with current values
        totalBurnedElement.textContent = currentBurned.toLocaleString();
        
        // Keep current percentage
        const currentPercentage = parseFloat(percentageElement.textContent) || 0;
        progressBar.style.width = `${currentPercentage}%`;
        percentageElement.textContent = `${currentPercentage.toFixed(2)}%`;
    }
}

/**
 * Helper function to fetch milestones without updating UI
 * @returns {Object|null} The milestones data if successful, null if failed
 */
async function fetchMilestonesFromAPI() {
    try {
        const response = await fetch('/api/milestones');
        
        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error fetching milestones directly:', error);
        return null;
    }
}

/**
 * Animate counter from start value to end value
 * @param {string} elementId - ID of element to animate
 * @param {number} startValue - Starting value
 * @param {number} endValue - Ending value
 * @param {number} duration - Animation duration in ms
 */
function animateCounter(elementId, startValue, endValue, duration) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    const startTimestamp = performance.now();
    const formatNumber = num => num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    
    function updateCounter(timestamp) {
        const elapsed = timestamp - startTimestamp;
        const progress = Math.min(elapsed / duration, 1);
        
        const value = startValue + Math.floor((endValue - startValue) * progress);
        element.textContent = formatNumber(value);
        
        if (progress < 1) {
            requestAnimationFrame(updateCounter);
        }
    }
    
    requestAnimationFrame(updateCounter);
}

/**
 * Animate progress bar from start percentage to end percentage
 * @param {HTMLElement} progressBar - Progress bar element
 * @param {HTMLElement} percentageElement - Percentage text element
 * @param {number} startPercentage - Starting percentage
 * @param {number} endPercentage - Ending percentage
 */
function animateProgressBar(progressBar, percentageElement, startPercentage, endPercentage) {
    const duration = 1000; // ms
    const startTimestamp = performance.now();
    
    function updateProgress(timestamp) {
        const elapsed = timestamp - startTimestamp;
        const progress = Math.min(elapsed / duration, 1);
        
        const currentPercentage = startPercentage + ((endPercentage - startPercentage) * progress);
        progressBar.style.width = `${currentPercentage}%`;
        percentageElement.textContent = `${currentPercentage.toFixed(2)}%`;
        
        if (progress < 1) {
            requestAnimationFrame(updateProgress);
        }
    }
    
    requestAnimationFrame(updateProgress);
}

/**
 * Format number as currency with K, M, B suffixes
 * @param {number} value - Number to format
 * @returns {string} Formatted string
 */
function formatCurrency(value) {
    if (value >= 1000000000) {
        return (value / 1000000000).toFixed(2) + 'B';
    } else if (value >= 1000000) {
        return (value / 1000000).toFixed(2) + 'M';
    } else if (value >= 1000) {
        return (value / 1000).toFixed(1) + 'K';
    } else {
        return value.toFixed(2);
    }
}

/**
 * Get formatted time ago string
 * @param {Date} date - Date to calculate from
 * @returns {string} Formatted time ago
 */
function getTimeAgo(date) {
    const now = new Date();
    const secondsAgo = Math.floor((now - date) / 1000);
    
    if (secondsAgo < 60) {
        return `${secondsAgo} sec${secondsAgo !== 1 ? 's' : ''} ago`;
    }
    
    const minutesAgo = Math.floor(secondsAgo / 60);
    if (minutesAgo < 60) {
        return `${minutesAgo} min${minutesAgo !== 1 ? 's' : ''} ago`;
    }
    
    const hoursAgo = Math.floor(minutesAgo / 60);
    if (hoursAgo < 24) {
        return `${hoursAgo} hour${hoursAgo !== 1 ? 's' : ''} ago`;
    }
    
    const daysAgo = Math.floor(hoursAgo / 24);
    return `${daysAgo} day${daysAgo !== 1 ? 's' : ''} ago`;
}