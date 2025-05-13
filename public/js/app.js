/**
 * $INFERNO Token Dashboard JavaScript
 * Connects frontend with backend API and updates dashboard in real-time
 */

document.addEventListener('DOMContentLoaded', function() {
    // Initialize dashboard
    initializeDashboard();
    
    // Set up refresh interval (every 60 seconds)
    setInterval(refreshData, 60000);
    
    // Set up manual refresh button
    const refreshButton = document.getElementById('refresh-data');
    if (refreshButton) {
        refreshButton.addEventListener('click', () => {
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
function loadDemoData() {
    console.log('Loading demo data...');
    
    // Initialize with static data
    const totalBurned = 122503892;
    const burnPercentage = 12.25;
    
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
}

/**
 * Refresh all dashboard data
 * @param {boolean} animate - Whether to animate the transitions
 */
async function refreshData(animate = false) {
    try {
        await Promise.all([
            fetchAndUpdateMetrics(animate),
            fetchAndUpdateMilestones()
        ]);
        
        console.log('Dashboard data refreshed');
    } catch (error) {
        console.error('Error refreshing data:', error);
        
        // If API fails, simulate data change
        simulateDataRefresh();
    }
}

/**
 * Fetch metrics data from API and update UI
 * @param {boolean} animate - Whether to animate the transitions
 */
async function fetchAndUpdateMetrics(animate = false) {
    try {
        const response = await fetch('/api/metrics');
        
        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Metrics data:', data);
        
        // Update total burned
        updateBurnMetrics(data, animate);
        
    } catch (error) {
        console.error('Error fetching metrics:', error);
        throw error;
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
        
    } catch (error) {
        console.error('Error fetching milestones:', error);
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
    
    if (!totalBurnedElement || !progressBar || !percentageElement) {
        return;
    }
    
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
        marketCapElement.innerHTML = `Current Market Cap: <strong>$${formatCurrency(data.currentMarketCap)}</strong>`;
    }
    
    // Update milestone stats
    const completedCount = data.milestones.filter(m => m.completed).length;
    const completedCountElement = document.querySelector('.stat-card:nth-child(1) .stat-value');
    if (completedCountElement) {
        completedCountElement.textContent = `${completedCount} of ${data.milestones.length}`;
    }
    
    // Update next milestone
    const nextMilestone = data.milestones.find(m => !m.completed);
    if (nextMilestone) {
        const nextMilestoneElement = document.querySelector('.stat-card:nth-child(4) .stat-value');
        const nextMilestoneSubElement = document.querySelector('.stat-card:nth-child(4) .stat-sub');
        
        if (nextMilestoneElement && nextMilestoneSubElement) {
            nextMilestoneElement.textContent = `$${formatCurrency(nextMilestone.marketCap)}`;
            nextMilestoneSubElement.textContent = `${nextMilestone.percentOfSupply.toFixed(2)}% Burn (${nextMilestone.burnAmount.toLocaleString()} tokens)`;
        }
    }
    
    // More advanced milestone UI updates could be implemented here
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
 * Simulate data refresh when API is not available
 * Useful for demo mode
 */
function simulateDataRefresh() {
    // Get current burn amount
    const totalBurnedElement = document.getElementById('total-burned');
    const progressBar = document.getElementById('burn-progress');
    const percentageElement = document.getElementById('burn-percentage');
    const marketCapElement = document.getElementById('current-marketcap');
    
    if (totalBurnedElement && progressBar && percentageElement) {
        const currentBurned = parseInt(totalBurnedElement.textContent.replace(/,/g, '')) || 122503892;
        const burnIncrease = Math.floor(Math.random() * 10000) + 5000;
        const newBurned = currentBurned + burnIncrease;
        
        // Animate the counter
        animateCounter('total-burned', currentBurned, newBurned, 1000);
        
        // Calculate and update percentage
        const percentage = (newBurned / 1000000000) * 100;
        animateProgressBar(progressBar, percentageElement, parseFloat(percentageElement.textContent), percentage.toFixed(2));
    }
    
    // Update market cap with random value
    if (marketCapElement) {
        const currentText = marketCapElement.innerHTML;
        const match = currentText.match(/\$(\d+\.\d+)K/);
        let currentValue = 350.0;
        
        if (match && match[1]) {
            currentValue = parseFloat(match[1]);
        }
        
        const randomIncrease = Math.floor(Math.random() * 5000) + 1000;
        const newValue = (currentValue + randomIncrease/1000).toFixed(1);
        marketCapElement.innerHTML = `Current Market Cap: <strong>$${newValue}K</strong>`;
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