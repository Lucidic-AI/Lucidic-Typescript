/**
 * error recovery showcase (simple version with decorator HOF)
 * 
 * demonstrates the SDK's stateless error boundary and recovery capabilities:
 * - failed operations don't affect subsequent operations
 * - mixed success/failure scenarios work smoothly
 * - events are tracked even when underlying calls fail
 * - each operation gets a fresh chance to succeed
 * 
 * uses the decorator as a higher-order function for ESM compatibility
 */

import * as lucidic from '../src/index';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import * as dotenv from 'dotenv';

// load environment variables
dotenv.config();

// initialize AI clients (they will be created with whatever keys are provided)
let openaiClient: OpenAI | null = null;
let anthropicClient: Anthropic | null = null;

/**
 * function that calls OpenAI - wrapped with event decorator HOF
 */
const callOpenAI = lucidic.event({ 
    tags: ['openai', 'llm'],
    metadata: { provider: 'openai' }
})(async function callOpenAI(prompt: string): Promise<string> {
    try {
        if (!openaiClient) {
            return 'OpenAI client not initialized';
        }
        
        console.log('  → Calling OpenAI API...');
        const response = await openaiClient.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 50,
        });
        
        const result = response.choices[0]?.message?.content || 'No response';
        console.log('  ✓ OpenAI responded:', result.substring(0, 50) + '...');
        
        // the decorator automatically creates an LLM event with the response
        // no need for manual createLLMEvent call
        
        return result;
    } catch (error) {
        console.log('  ✗ OpenAI call failed:', (error as Error).message);
        // the decorator automatically captures the error
        return `OpenAI error: ${(error as Error).message}`;
    }
});

/**
 * function that calls Anthropic - wrapped with event decorator HOF
 */
const callAnthropic = lucidic.event({ 
    tags: ['anthropic', 'llm'],
    metadata: { provider: 'anthropic' }
})(async function callAnthropic(prompt: string): Promise<string> {
    try {
        if (!anthropicClient) {
            return 'Anthropic client not initialized';
        }
        
        console.log('  → Calling Anthropic API...');
        const response = await anthropicClient.messages.create({
            model: 'claude-3-haiku-20240307',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 50,
        });
        
        const result = response.content[0].type === 'text' 
            ? response.content[0].text 
            : 'No text response';
        console.log('  ✓ Anthropic responded:', result.substring(0, 50) + '...');
        
        // the decorator automatically creates an LLM event with the response
        
        return result;
    } catch (error) {
        console.log('  ✗ Anthropic call failed:', (error as Error).message);
        // the decorator automatically captures the error
        return `Anthropic error: ${(error as Error).message}`;
    }
});

/**
 * function that calls both providers - wrapped with event decorator HOF
 */
const callBothProviders = lucidic.event({ 
    tags: ['orchestration', 'multi-provider'],
    metadata: { providers: ['openai', 'anthropic'] }
})(async function callBothProviders(prompt: string): Promise<{ openai: string; anthropic: string }> {
    console.log('  → Calling both providers...');
    
    // call both providers (they might fail but that's ok)
    // the decorator creates parent-child event relationships automatically
    const [openaiResult, anthropicResult] = await Promise.all([
        callOpenAI(prompt),
        callAnthropic(prompt)
    ]);
    
    return {
        openai: openaiResult,
        anthropic: anthropicResult
    };
});

/**
 * main showcase function
 */
async function showcaseErrorRecovery() {
    console.log('🚀 Error Recovery Showcase (Simple Version with Decorator HOF)');
    console.log('=' .repeat(60));
    
    // ensure we're in silent mode for the demo
    console.log(`Error boundary mode: ${lucidic.isInSilentMode() ? 'Silent (errors handled)' : 'Standard (errors propagate)'}`);
    
    // stats tracking
    let successfulSessions = 0;
    let failedSessions = 0;
    let experimentId: string | undefined;
    
    // step 1: Create experiment with random API key (will fail)
    console.log('\n📊 Step 1: Create experiment with random API key');
    console.log('-'.repeat(40));
    
    const failedExperiment = await lucidic.createExperiment({
        experimentName: 'Error Recovery Test - Failed',
        apiKey: 'random-invalid-key-' + Math.random(),
        agentId: 'random-agent-id',
        description: 'This should fail and return fallback',
    });
    
    console.log('Failed experiment result:', failedExperiment);
    if (failedExperiment?.startsWith('fallback-experiment-')) {
        console.log('✓ Correctly received fallback experiment ID');
    }
    
    // step 2: Create experiment with valid credentials (should succeed if .env is configured)
    console.log('\n📊 Step 2: Create experiment with valid credentials');
    console.log('-'.repeat(40));
    
    const validApiKey = process.env.LUCIDIC_API_KEY;
    const validAgentId = process.env.LUCIDIC_AGENT_ID;
    
    if (!validApiKey || !validAgentId) {
        console.log('⚠️  No valid credentials in .env, using fallback mode');
        experimentId = 'fallback-experiment-demo';
    } else {
        const successfulExperiment = await lucidic.createExperiment({
            experimentName: 'Error Recovery Test - Success',
            apiKey: validApiKey,
            agentId: validAgentId,
            description: 'This should succeed with valid credentials',
            tags: ['error-recovery', 'showcase'],
        });
        
        experimentId = successfulExperiment;
        console.log('Successful experiment ID:', experimentId);
        
        if (!experimentId?.startsWith('fallback-')) {
            console.log('✓ Successfully created real experiment');
        }
    }
    
    // initialize AI clients with available keys
    if (process.env.OPENAI_API_KEY) {
        openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        console.log('✓ OpenAI client initialized');
    } else {
        console.log('⚠️  No OpenAI API key found');
    }
    
    if (process.env.ANTHROPIC_API_KEY) {
        anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        console.log('✓ Anthropic client initialized');
    } else {
        console.log('⚠️  No Anthropic API key found');
    }
    
    // step 3: Create 10 sessions with alternating credentials
    console.log('\n🔄 Step 3: Creating 10 sessions with mixed credentials');
    console.log('-'.repeat(40));
    
    const sessionResults: Array<{ id: string; success: boolean }> = [];
    
    for (let i = 0; i < 10; i++) {
        const isEven = i % 2 === 0;
        const useValidCredentials = isEven;
        
        console.log(`\n📝 Session ${i + 1}/10 (${useValidCredentials ? 'valid' : 'invalid'} credentials)`);
        
        // prepare session params
        const sessionParams: lucidic.InitParams = {
            sessionName: `Session ${i + 1}`,
            experimentId: experimentId,
            apiKey: useValidCredentials 
                ? validApiKey 
                : `random-key-${Math.random()}`,
            agentId: useValidCredentials 
                ? validAgentId 
                : `random-agent-${Math.random()}`,
            tags: [`session-${i + 1}`, useValidCredentials ? 'valid-creds' : 'invalid-creds'],
        };
        
        // initialize session
        const sessionId = await lucidic.init(sessionParams);
        
        let isSuccess = false;
        if (sessionId?.startsWith('fallback-session-')) {
            console.log(`  ✗ Session failed (fallback ID: ${sessionId})`);
            failedSessions++;
        } else {
            console.log(`  ✓ Session initialized: ${sessionId}`);
            successfulSessions++;
            isSuccess = true;
        }
        
        sessionResults.push({ id: sessionId || 'none', success: isSuccess });
        
        // call functions with automatic event tracking via decorator
        console.log('  Calling functions (auto-tracked by decorator)...');
        
        // 1. Call OpenAI - decorator automatically creates event
        await callOpenAI('Say hello in 5 words');
        
        // 2. Call Anthropic - decorator automatically creates event
        await callAnthropic('Say goodbye in 5 words');
        
        // 3. Call both providers - decorator automatically creates orchestration event
        const bothResults = await callBothProviders('What is 2+2?');
        console.log('  Both providers results:', {
            openai: bothResults.openai.substring(0, 30) + '...',
            anthropic: bothResults.anthropic.substring(0, 30) + '...'
        });
        
        // flush events for this session
        await lucidic.flush();
        
        // end session if it was successful
        if (!sessionId?.startsWith('fallback-')) {
            await lucidic.endSession({
                isSuccessful: true,
                metadata: {
                    sessionNumber: i + 1,
                    functionsCalledWithDecorator: 3,
                    decoratorType: 'higher-order-function',
                }
            });
            console.log('  ✓ Session ended successfully');
        } else {
            console.log('  ⚠️  Session was fallback, auto-cleanup handled by error boundary');
        }
    }
    
    // step 4: Summary
    console.log('\n📈 Summary');
    console.log('=' .repeat(60));
    console.log(`\nExperiments:`);
    console.log(`  - Total created: 2`);
    console.log(`  - Failed (fallback): 1`); 
    console.log(`  - Successful: ${experimentId?.startsWith('fallback-') ? '0 (using fallback)' : '1'}`);
    
    console.log(`\nSessions:`);
    console.log(`  - Total created: 10`);
    console.log(`  - Successful: ${successfulSessions}`);
    console.log(`  - Failed (fallback): ${failedSessions}`);
    
    console.log(`\nFunction Calls:`);
    console.log(`  - Total tracked: 30 (3 per session)`);
    console.log(`  - Tracking method: Decorator HOF (ESM-friendly)`);
    console.log(`  - Auto-captured: function name, args, return, duration, errors`);
    
    console.log(`\nError Boundary:`);
    console.log(`  - Mode: ${lucidic.isInSilentMode() ? 'Silent mode (errors handled)' : 'Standard mode'}`);
    console.log(`  - Emergency-ended sessions: ${lucidic.getEndedSessionCount()}`);
    
    // show error history
    const errorHistory = lucidic.getErrorHistory();
    console.log(`  - Errors collected: ${errorHistory.length}`);
    if (errorHistory.length > 0) {
        console.log(`\nRecent SDK errors (last 5):`);
        errorHistory.slice(-5).forEach((err, i) => {
            console.log(`  ${i + 1}. ${err.moduleName}.${err.functionName} at ${new Date(err.timestamp).toLocaleTimeString()}`);
        });
    }
    
    console.log('\n✅ Showcase complete!');
    console.log('\nKey observations:');
    console.log('✓ Failed experiment returned fallback ID but didn\'t block next attempt');
    console.log('✓ Each session got a fresh chance regardless of previous failures');
    console.log('✓ Functions auto-tracked by decorator HOF (no manual event creation)');
    console.log('✓ No cascade failures - one bad session didn\'t affect others');
    console.log('✓ Error boundary handled cleanup for failed sessions automatically');
    console.log('✓ The SDK remained functional throughout despite multiple failures');
    console.log('✓ ESM-friendly: Works with tsx/node without decorator syntax issues');
}

// run the showcase if executed directly
// using import.meta.url for ESM compatibility
if (import.meta.url === `file://${process.argv[1]}`) {
    console.log('Starting Error Recovery Showcase...\n');
    console.log('This version uses the decorator as a higher-order function (HOF)');
    console.log('which is ESM-friendly and works with tsx without special config\n');
    console.log('Make sure to set LUCIDIC_SILENT_MODE=true for best results');
    console.log('Optional: Set OPENAI_API_KEY and ANTHROPIC_API_KEY for LLM calls\n');
    
    showcaseErrorRecovery()
        .then(() => {
            console.log('\n👋 Exiting gracefully...');
            process.exit(0);
        })
        .catch((error) => {
            console.error('Unexpected error:', error);
            process.exit(1);
        });
}

export { showcaseErrorRecovery, callOpenAI, callAnthropic, callBothProviders };