document.addEventListener('DOMContentLoaded', function() {
    const exaApiKeyInput = document.getElementById('exaApiKey');
    const toggleExaKeyBtn = document.getElementById('toggleExaKey');
    const perplexityApiKeyInput = document.getElementById('perplexityApiKey');
    const togglePerplexityKeyBtn = document.getElementById('togglePerplexityKey');
    const saveApiKeyBtn = document.getElementById('saveApiKey');
    const apiStatus = document.getElementById('apiStatus');
    const statusDot = apiStatus.querySelector('.status-dot');
    const statusText = apiStatus.querySelector('.status-text');

    // Load saved API keys
    chrome.storage.sync.get(['exaApiKey', 'perplexityApiKey'], function(result) {
        if (result.exaApiKey) {
            exaApiKeyInput.value = result.exaApiKey;
        }
        if (result.perplexityApiKey) {
            perplexityApiKeyInput.value = result.perplexityApiKey;
        }
        
        // Update status based on whether both are configured
        if (result.exaApiKey && result.perplexityApiKey) {
            updateStatus(true, 'All credentials configured');
        } else if (result.exaApiKey || result.perplexityApiKey) {
            updateStatus(false, 'Incomplete configuration');
        } else {
            updateStatus(false, 'Not configured');
        }
    });

    // Toggle Exa API key visibility
    toggleExaKeyBtn.addEventListener('click', function() {
        if (exaApiKeyInput.type === 'password') {
            exaApiKeyInput.type = 'text';
            toggleExaKeyBtn.textContent = '🙈';
        } else {
            exaApiKeyInput.type = 'password';
            toggleExaKeyBtn.textContent = '👁️';
        }
    });

    // Toggle Perplexity API key visibility
    togglePerplexityKeyBtn.addEventListener('click', function() {
        if (perplexityApiKeyInput.type === 'password') {
            perplexityApiKeyInput.type = 'text';
            togglePerplexityKeyBtn.textContent = '🙈';
        } else {
            perplexityApiKeyInput.type = 'password';
            togglePerplexityKeyBtn.textContent = '👁️';
        }
    });

    // Save API keys
    saveApiKeyBtn.addEventListener('click', function() {
        const exaApiKey = exaApiKeyInput.value.trim();
        const perplexityApiKey = perplexityApiKeyInput.value.trim();
        
        if (!exaApiKey) {
            showMessage("Please enter your Exa Labs API key", "error");
            return;
        }
        if (!perplexityApiKey) {
            showMessage("Please enter your Perplexity API key", "error");
            return;
        }

        saveApiKeyBtn.disabled = true;
        saveApiKeyBtn.textContent = 'Saving...';

        // Save to storage
        chrome.storage.sync.set({
            exaApiKey: exaApiKey,
            perplexityApiKey: perplexityApiKey
        }, function() {
            if (chrome.runtime.lastError) {
                showMessage('Failed to save credentials', 'error');
                updateStatus(false, 'Failed to save credentials');
            } else {
                showMessage('Credentials saved successfully', 'success');
                updateStatus(true, 'All credentials configured');
                
                // Test the API keys
                testApiKeys(exaApiKey, perplexityApiKey);
            }
            
            saveApiKeyBtn.disabled = false;
            saveApiKeyBtn.textContent = 'Save';
        });
    });

    function updateStatus(isValid, message) {
        if (isValid) {
            statusDot.classList.add('success');
            statusDot.style.background = '#10b981';
        } else {
            statusDot.classList.remove('success');
            statusDot.style.background = '#ef4444';
        }
        statusText.textContent = message;
    }

    function showMessage(text, type) {
        // Remove existing messages
        const existingMessages = document.querySelectorAll('.message');
        existingMessages.forEach(msg => msg.remove());

        // Create new message
        const message = document.createElement('div');
        message.className = `message ${type}`;
        message.textContent = text;
        message.style.display = 'block';

        // Insert after settings section
        const settingsSection = document.querySelector('.settings-section');
        settingsSection.insertAdjacentElement('afterend', message);

        // Auto-hide after 3 seconds
        setTimeout(() => {
            message.style.display = 'none';
            message.remove();
        }, 3000);
    }

    function testApiKeys(exaApiKey, perplexityApiKey) {
        // Send message to background script to test API keys
        chrome.runtime.sendMessage({
            action: 'testApiKey',
            exaApiKey: exaApiKey,
            perplexityApiKey: perplexityApiKey
        }, function(response) {
            if (response && response.success) {
                updateStatus(true, 'All APIs verified');
            } else {
                updateStatus(false, 'API verification failed');
                showMessage(response && response.error ? response.error : 'Verification failed. Check all credentials.', 'error');
            }
        });
    }
});

