// Background script for LLM Fact Checker extension

// Create context menu when extension is installed
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: 'factCheck',
        title: 'Fact-check with AI',
        contexts: ['selection']
    });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'factCheck' && info.selectionText) {
        // Send message to content script to start fact-checking
        chrome.tabs.sendMessage(tab.id, {
            action: 'startFactCheck',
            text: info.selectionText.trim()
        });
    }
});

// Handle messages from popup and content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'testApiKey') {
        testApiKeys(request.exaApiKey, request.perplexityApiKey).then(result => {
            sendResponse(result);
        });
        return true; // Keep message channel open for async response
    }
    
    if (request.action === 'factCheck') {
        performFactCheck(request.text, request.exaApiKey, request.perplexityApiKey).then(result => {
            sendResponse(result);
        });
        return true; // Keep message channel open for async response
    }
});

// Test API keys validity
async function testApiKeys(exaApiKey, perplexityApiKey) {
    try {
        // Test Exa Labs API
        const exaResponse = await fetch('https://api.exa.ai/answer', {
            method: 'POST',
            headers: {
                'x-api-key': exaApiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                query: 'test query',
                text: false
            })
        });

        if (!exaResponse.ok) {
            return { success: false, error: 'Exa Labs API test failed' };
        }

        // Test Perplexity API
        const perplexityResponse = await fetch('https://api.perplexity.ai/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${perplexityApiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'sonar',
                messages: [
                    {
                        role: 'user',
                        content: 'Test message'
                    }
                ],
                max_tokens: 10
            })
        });

        if (!perplexityResponse.ok) {
            return { success: false, error: 'Perplexity API test failed' };
        }

        return { success: true };
    } catch (error) {
        console.error('API key test error:', error);
        return { success: false, error: error.message };
    }
}

// Perform fact-checking using both Exa Labs and Perplexity APIs
async function performFactCheck(text, exaApiKey, perplexityApiKey) {
    try {
        // Run both APIs in parallel
        const [exaResult, perplexityResult] = await Promise.all([
            getExaLabsResults(text, exaApiKey),
            getPerplexityAnalysis(text, perplexityApiKey)
        ]);

        // Combine results using voting mechanism
        const combinedResult = combineResults(text, exaResult, perplexityResult);

        return {
            success: true,
            result: combinedResult
        };
    } catch (error) {
        console.error('Fact-check error:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// Get Exa Labs search results and answer
async function getExaLabsResults(text, apiKey) {
    try {
        const response = await fetch('https://api.exa.ai/answer', {
            method: 'POST',
            headers: {
                'x-api-key': apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                query: `Fact-check this statement: "${text}"`,
                text: true
            })
        });

        if (!response.ok) {
            throw new Error(`Exa Labs API request failed: ${response.status}`);
        }

        const data = await response.json();
        
        // Extract sources from citations
        const sources = data.citations ? data.citations.slice(0, 3).map(citation => ({
            name: citation.title,
            url: citation.url,
            snippet: citation.text || ''
        })) : [];

        // Analyze the answer for factual stance
        const answer = data.answer || '';
        const lowerAnswer = answer.toLowerCase();
        
        let vote = 'neutral';
        let confidence = 0.5;
        let reasoning = answer;

        // Simple analysis of Exa's answer
        if (lowerAnswer.includes('true') || lowerAnswer.includes('correct') || lowerAnswer.includes('accurate')) {
            vote = 'support';
            confidence = 0.7;
        } else if (lowerAnswer.includes('false') || lowerAnswer.includes('incorrect') || lowerAnswer.includes('wrong')) {
            vote = 'contradict';
            confidence = 0.7;
        } else if (lowerAnswer.includes('uncertain') || lowerAnswer.includes('unclear') || lowerAnswer.includes('mixed')) {
            vote = 'neutral';
            confidence = 0.4;
        }

        // Assess source reliability
        const reliableDomains = ['wikipedia.org', 'britannica.com', 'edu', 'gov', 'nature.com', 'science.org', 'reuters.com', 'bbc.com'];
        const hasReliableSources = sources.some(source => 
            reliableDomains.some(domain => source.url.includes(domain))
        );

        if (hasReliableSources) {
            confidence = Math.min(confidence + 0.2, 1.0);
        }

        return {
            vote: vote,
            confidence: confidence,
            sources: sources,
            reasoning: reasoning,
            fullAnswer: answer
        };
    } catch (error) {
        console.error('Exa Labs search error:', error);
        return {
            vote: 'neutral',
            confidence: 0.1,
            sources: [],
            reasoning: 'Exa Labs search failed',
            fullAnswer: ''
        };
    }
}

// Get Perplexity AI analysis
async function getPerplexityAnalysis(text, apiKey) {
    try {
        const response = await fetch('https://api.perplexity.ai/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'sonar',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a fact-checker. Analyze the given statement for factual accuracy. Respond with: 1) TRUE/FALSE/UNCERTAIN, 2) Confidence level (0-1), 3) Brief explanation, 4) Key sources if available. Be concise and precise.'
                    },
                    {
                        role: 'user',
                        content: `Please fact-check this statement: "${text}"`
                    }
                ],
                max_tokens: 200,
                temperature: 0.1
            })
        });

        if (!response.ok) {
            throw new Error(`Perplexity API request failed: ${response.status}`);
        }

        const data = await response.json();
        const content = data.choices[0].message.content;

        // Parse Perplexity response
        const analysis = parsePerplexityResponse(content);
        
        // Extract sources from search_results if available
        const sources = data.search_results ? data.search_results.slice(0, 3).map(result => ({
            name: result.title,
            url: result.url
        })) : [];

        return {
            vote: analysis.verdict,
            confidence: analysis.confidence,
            sources: sources,
            reasoning: analysis.explanation,
            fullResponse: content
        };
    } catch (error) {
        console.error('Perplexity analysis error:', error);
        return {
            vote: 'neutral',
            confidence: 0.1,
            sources: [],
            reasoning: 'Perplexity analysis failed'
        };
    }
}

// Parse Perplexity response to extract verdict and confidence
function parsePerplexityResponse(content) {
    const lowerContent = content.toLowerCase();
    
    let verdict = 'neutral';
    let confidence = 0.5;
    let explanation = content;

    // Extract verdict
    if (lowerContent.includes('true') && !lowerContent.includes('false')) {
        verdict = 'support';
    } else if (lowerContent.includes('false') && !lowerContent.includes('true')) {
        verdict = 'contradict';
    } else if (lowerContent.includes('uncertain') || lowerContent.includes('unclear')) {
        verdict = 'neutral';
    }

    // Extract confidence (look for numbers between 0 and 1)
    const confidenceMatch = content.match(/(?:confidence|certainty).*?(\d+(?:\.\d+)?)/i);
    if (confidenceMatch) {
        const confValue = parseFloat(confidenceMatch[1]);
        if (confValue <= 1) {
            confidence = confValue;
        } else if (confValue <= 100) {
            confidence = confValue / 100;
        }
    }

    return { verdict, confidence, explanation };
}

// Combine results from both APIs using voting mechanism
function combineResults(originalText, exaResult, perplexityResult) {
    // Voting weights
    const exaWeight = 0.4;
    const perplexityWeight = 0.6;

    // Calculate weighted confidence
    const totalConfidence = (exaResult.confidence * exaWeight) + (perplexityResult.confidence * perplexityWeight);

    // Determine final verdict based on votes
    let finalVerdict = 'uncertain';
    let status = 'uncertain';
    let title = 'Uncertain';
    let description = 'Mixed or insufficient evidence';

    if (exaResult.vote === 'support' && perplexityResult.vote === 'support') {
        finalVerdict = 'support';
        status = 'true';
        title = 'Likely True';
        description = 'Both sources support this claim';
    } else if (exaResult.vote === 'contradict' || perplexityResult.vote === 'contradict') {
        finalVerdict = 'contradict';
        status = 'false';
        title = 'Likely False';
        description = 'Evidence contradicts this claim';
    } else if (exaResult.vote === 'support' || perplexityResult.vote === 'support') {
        finalVerdict = 'support';
        status = 'true';
        title = 'Possibly True';
        description = 'Some evidence supports this claim';
    }

    // Combine sources from both APIs
    const allSources = [...exaResult.sources, ...perplexityResult.sources];
    const uniqueSources = allSources.filter((source, index, self) => 
        index === self.findIndex(s => s.url === source.url)
    ).slice(0, 5);

    // Generate explanation
    const explanation = `Exa Labs: ${exaResult.reasoning}. Perplexity AI: ${perplexityResult.reasoning}`;

    // Determine confidence level
    let confidenceLevel = 'Low Confidence';
    if (totalConfidence >= 0.7) {
        confidenceLevel = 'High Confidence';
    } else if (totalConfidence >= 0.5) {
        confidenceLevel = 'Medium Confidence';
    }

    return {
        status: status,
        title: title,
        description: description,
        explanation: explanation,
        sources: uniqueSources,
        rating: confidenceLevel,
        confidence: totalConfidence,
        details: {
            exa: exaResult,
            perplexity: perplexityResult
        }
    };
}

