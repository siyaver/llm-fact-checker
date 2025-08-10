// Content script for LLM Fact Checker extension

let factCheckCard = null;

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'startFactCheck') {
        startFactCheck(request.text);
    }
});

// Start fact-checking process
async function startFactCheck(text) {
    try {
        // Remove any existing fact-check card
        removeFactCheckCard();
        
        // Create and show loading card
        createFactCheckCard(text, 'loading');
        
        // Get API credentials from storage
        const credentials = await new Promise((resolve) => {
            chrome.storage.sync.get(['exaApiKey', 'perplexityApiKey'], resolve);
        });
        
        if (!credentials.exaApiKey || !credentials.perplexityApiKey) {
            updateFactCheckCard({
                status: 'error',
                title: 'Configuration Error',
                description: 'Please configure all API keys in the extension popup.',
                explanation: 'Go to the extension popup and enter your Exa Labs API key and Perplexity API key.',
                sources: []
            });
            return;
        }
        
        // Send fact-check request to background script
        chrome.runtime.sendMessage({
            action: 'factCheck',
            text: text,
            exaApiKey: credentials.exaApiKey,
            perplexityApiKey: credentials.perplexityApiKey
        }, (response) => {
            if (response && response.success) {
                updateFactCheckCard(response.result);
            } else {
                updateFactCheckCard({
                    status: 'error',
                    title: 'Fact-Check Failed',
                    description: 'Unable to verify this statement.',
                    explanation: response ? response.error : 'Unknown error occurred',
                    sources: []
                });
            }
        });
        
    } catch (error) {
        console.error('Fact-check error:', error);
        updateFactCheckCard({
            status: 'error',
            title: 'Error',
            description: 'An error occurred during fact-checking.',
            explanation: error.message,
            sources: []
        });
    }
}

// Create fact-check card
function createFactCheckCard(text, status = 'loading') {
    // Remove existing card
    removeFactCheckCard();
    
    // Create card element
    factCheckCard = document.createElement('div');
    factCheckCard.className = 'fact-check-card';
    factCheckCard.innerHTML = `
        <div class="fact-check-header">
            <div class="fact-check-title">
                <span class="fact-check-icon">🔍</span>
                <span>Fact Checker</span>
            </div>
            <button class="fact-check-close" onclick="this.closest('.fact-check-card').remove()">×</button>
        </div>
        <div class="fact-check-content">
            <div class="checked-text">
                <strong>Checked:</strong> "${text.substring(0, 100)}${text.length > 100 ? '...' : ''}"
            </div>
            <div class="fact-check-result">
                ${status === 'loading' ? getLoadingHTML() : ''}
            </div>
        </div>
    `;
    
    // Position card near the selected text
    positionCard();
    
    // Add card to page
    document.body.appendChild(factCheckCard);
    
    // Add click outside to close
    setTimeout(() => {
        document.addEventListener('click', handleOutsideClick);
    }, 100);
}

// Get loading HTML
function getLoadingHTML() {
    return `
        <div class="loading-container">
            <div class="loading-spinner"></div>
            <div class="loading-steps">
                <div class="loading-step active">
                    <span class="step-icon">🔍</span>
                    <span>Searching with Exa Labs...</span>
                </div>
                <div class="loading-step">
                    <span class="step-icon">🤖</span>
                    <span>Analyzing with Perplexity AI...</span>
                </div>
                <div class="loading-step">
                    <span class="step-icon">⚖️</span>
                    <span>Combining results...</span>
                </div>
            </div>
        </div>
    `;
}

// Update fact-check card with results
function updateFactCheckCard(result) {
    if (!factCheckCard) return;
    
    const resultContainer = factCheckCard.querySelector('.fact-check-result');
    if (!resultContainer) return;
    
    // Animate loading steps completion
    if (result.status !== 'error') {
        animateLoadingSteps(() => {
            showResults(result);
        });
    } else {
        showResults(result);
    }
}

// Animate loading steps
function animateLoadingSteps(callback) {
    const steps = factCheckCard.querySelectorAll('.loading-step');
    let currentStep = 0;
    
    const animateStep = () => {
        if (currentStep < steps.length) {
            steps[currentStep].classList.add('active');
            if (currentStep > 0) {
                steps[currentStep - 1].classList.add('completed');
            }
            currentStep++;
            setTimeout(animateStep, 800);
        } else {
            setTimeout(callback, 500);
        }
    };
    
    animateStep();
}

// Show results
function showResults(result) {
    const resultContainer = factCheckCard.querySelector('.fact-check-result');
    
    const statusIcon = getStatusIcon(result.status);
    const statusClass = getStatusClass(result.status);
    
    resultContainer.innerHTML = `
        <div class="result-header ${statusClass}">
            <span class="result-icon">${statusIcon}</span>
            <div class="result-title">${result.title}</div>
        </div>
        
        <div class="result-description">
            ${result.description}
        </div>
        
        ${result.rating ? `
            <div class="confidence-level">
                <strong>Confidence:</strong>
                <span class="confidence-badge ${getConfidenceClass(result.rating)}">${result.rating}</span>
            </div>
        ` : ''}
        
        <div class="result-explanation">
            ${result.explanation}
        </div>
        
        ${result.details ? `
            <div class="analysis-details">
                <div class="api-result">
                    <strong>🔍 Exa Labs:</strong> ${result.details.exa.reasoning}
                </div>
                <div class="api-result">
                    <strong>🤖 Perplexity AI:</strong> ${result.details.perplexity.reasoning}
                </div>
            </div>
        ` : ''}
        
        ${result.sources && result.sources.length > 0 ? `
            <div class="sources-section">
                <div class="sources-header">Sources:</div>
                <div class="sources-list">
                    ${result.sources.map(source => `
                        <div class="source-item">
                            <a href="${source.url}" target="_blank" rel="noopener noreferrer">
                                ${source.name}
                            </a>
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : ''}
    `;
}

// Get status icon
function getStatusIcon(status) {
    switch (status) {
        case 'true': return '✅';
        case 'false': return '❌';
        case 'uncertain': return '❓';
        case 'error': return '⚠️';
        default: return '🔍';
    }
}

// Get status class
function getStatusClass(status) {
    switch (status) {
        case 'true': return 'status-true';
        case 'false': return 'status-false';
        case 'uncertain': return 'status-uncertain';
        case 'error': return 'status-error';
        default: return 'status-neutral';
    }
}

// Get confidence class
function getConfidenceClass(rating) {
    if (rating.includes('High')) return 'confidence-high';
    if (rating.includes('Medium')) return 'confidence-medium';
    return 'confidence-low';
}

// Position card near selected text
function positionCard() {
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        
        // Position card below the selection
        factCheckCard.style.position = 'fixed';
        factCheckCard.style.left = Math.min(rect.left, window.innerWidth - 400) + 'px';
        factCheckCard.style.top = Math.min(rect.bottom + 10, window.innerHeight - 300) + 'px';
        factCheckCard.style.zIndex = '10000';
    } else {
        // Fallback position
        factCheckCard.style.position = 'fixed';
        factCheckCard.style.right = '20px';
        factCheckCard.style.top = '20px';
        factCheckCard.style.zIndex = '10000';
    }
}

// Handle clicks outside the card
function handleOutsideClick(event) {
    if (factCheckCard && !factCheckCard.contains(event.target)) {
        removeFactCheckCard();
    }
}

// Remove fact-check card
function removeFactCheckCard() {
    if (factCheckCard) {
        factCheckCard.remove();
        factCheckCard = null;
        document.removeEventListener('click', handleOutsideClick);
    }
}

