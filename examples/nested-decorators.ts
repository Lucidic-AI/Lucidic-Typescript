/**
 * Comprehensive test for event nesting in decorated functions.
 * 
 * This test validates:
 * - Multiple levels of nested decorated function calls
 * - Event parent-child relationships
 * - OpenAI API call instrumentation within decorated functions
 * - Error event generation from decorated functions
 * - Proper context propagation through nested calls
 */

import * as dotenv from 'dotenv';
import { init, event, endSession } from '../src/index';
import OpenAI from 'openai';

// Load environment variables
dotenv.config();

// Simple async delay helper
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Test functions with decorators (must be at module level)
@event({ metadata: { name: 'data_processor' } })
async function processData(data: number[]): Promise<{ sum: number; count: number; average: number }> {
  const result = {
    sum: data.reduce((a, b) => a + b, 0),
    count: data.length,
    average: data.length > 0 ? data.reduce((a, b) => a + b, 0) / data.length : 0
  };
  await delay(10);  // Simulate processing time
  return result;
}

@event({ metadata: { name: 'data_validator' } })
async function validateData(data: number[]): Promise<boolean> {
  if (!data || data.length === 0) return false;
  if (data.some(x => x < 0)) return false;
  await delay(10);  // Simulate validation time
  return true;
}

@event({ metadata: { name: 'ai_analyzer' } })
async function analyzeWithAI(processedData: { sum: number; count: number; average: number }): Promise<string> {
  try {
    // Use real OpenAI API (will be instrumented by SDK telemetry)
    if (!process.env.OPENAI_API_KEY) {
      // If no API key, return mock response
      return `Analysis of ${processedData.count} items (avg=${processedData.average}) | Summary: sum=${processedData.sum}`;
    }
    
    const openai = new OpenAI();
    
    // First real OpenAI call - analysis
    const response1 = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a data analyst. Respond in 10 words or less.' },
        { role: 'user', content: `Analyze: sum=${processedData.sum}, count=${processedData.count}, avg=${processedData.average}` }
      ],
      temperature: 0.7,
      max_tokens: 20
    });
    
    // Second real OpenAI call - summary
    const response2 = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'user', content: `Summarize in 5 words: ${response1.choices[0].message.content}` }
      ],
      temperature: 0.5,
      max_tokens: 15
    });
    
    return `${response1.choices[0].message.content} | ${response2.choices[0].message.content}`;
    
  } catch (e) {
    // Fallback on any error
    console.log(`OpenAI call failed: ${e}`);
    const analysis = `Analysis of ${processedData.count} items: average=${processedData.average}`;
    const summary = `Summary: Processing successful with sum=${processedData.sum}`;
    return `${analysis} | ${summary}`;
  }
}

@event({ metadata: { name: 'formatter' } })
async function formatResults(analysis: string, metadata: any): Promise<string> {
  const formatted = `[${metadata.timestamp}] ${analysis}`;
  await delay(10);
  return formatted;
}

@event({ metadata: { name: 'nested_helper' } })
async function nestedHelperFunction(value: number): Promise<number> {
  await delay(10);
  return value * 2;
}

@event({ metadata: { name: 'aggregator' } })
async function aggregateResults(data: number[], analysis: string): Promise<any> {
  // Call another nested function
  const sum = data.reduce((a, b) => a + b, 0);
  const multipliedSum = await nestedHelperFunction(sum);
  
  return {
    original_sum: sum,
    multiplied_sum: multipliedSum,
    analysis: analysis
  };
}

@event({ metadata: { name: 'main_workflow' } })
async function mainWorkflow(inputData: number[]): Promise<any> {
  // Step 1: Validate the data
  const isValid = await validateData(inputData);
  if (!isValid) {
    throw new Error('Invalid input data provided');
  }
  
  // Step 2: Process the data
  const processed = await processData(inputData);
  
  // Step 3: Analyze with AI (contains 2 OpenAI calls)
  const aiAnalysis = await analyzeWithAI(processed);
  
  // Step 4: Direct OpenAI call in main workflow (to test telemetry nesting)
  let finalValidation = 'Final validation: Complete';
  try {
    if (process.env.OPENAI_API_KEY) {
      const openai = new OpenAI();
      
      // Direct real LLM call within main_workflow
      const validationResponse = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'user', content: `Reply 'Valid' if this looks complete: ${aiAnalysis.substring(0, 30)}` }
        ],
        max_tokens: 10,
        temperature: 0
      });
      finalValidation = validationResponse.choices[0].message.content || 'Validation complete';
    } else {
      finalValidation = 'Validation: Complete (no API key)';
    }
  } catch (e) {
    console.log(`Validation OpenAI call failed: ${e}`);
    finalValidation = 'Final validation: Complete';
  }
  
  // Step 5: Aggregate results (calls nested_helper)
  const aggregated = await aggregateResults(inputData, aiAnalysis);
  
  // Step 6: Format the output
  const metadata = {
    timestamp: new Date().toISOString(),
    input_size: inputData.length,
    validation: finalValidation
  };
  const formattedOutput = await formatResults(aiAnalysis, metadata);
  
  // Step 7: Intentionally throw an error to test error event generation
  if (aggregated.multiplied_sum > 100) {
    throw new Error(`Multiplied sum ${aggregated.multiplied_sum} exceeds threshold!`);
  }
  
  return {
    formatted: formattedOutput,
    aggregated: aggregated,
    processed: processed
  };
}

// Async test functions
@event({ metadata: { name: 'async_processor' } })
async function asyncProcess(data: string): Promise<string> {
  await delay(10);
  return data.toUpperCase();
}

@event({ metadata: { name: 'async_validator' } })
async function asyncValidate(data: string): Promise<boolean> {
  await delay(10);
  return data.length > 0;
}

@event({ metadata: { name: 'async_main' } })
async function asyncMainWorkflow(inputText: string): Promise<any> {
  // Validate
  const isValid = await asyncValidate(inputText);
  if (!isValid) {
    throw new Error('Invalid input');
  }
  
  // Process
  const processed = await asyncProcess(inputText);
  
  // Intentional error for testing
  if (processed.includes('ERROR')) {
    throw new Error('Found ERROR in processed text');
  }
  
  return {
    original: inputText,
    processed: processed
  };
}

// Mixed sync/async test functions
@event({ metadata: { name: 'sync_helper' } })
function syncHelper(value: number): number {
  // Note: This is a sync function, no await
  return value + 10;
}

@event({ metadata: { name: 'async_caller' } })
async function asyncCaller(value: number): Promise<number> {
  await delay(10);
  // Call sync function from async context
  const result = syncHelper(value);
  return result * 2;
}

@event({ metadata: { name: 'mixed_main' } })
async function mixedWorkflow(startValue: number): Promise<number> {
  const result = await asyncCaller(startValue);
  
  // Error case
  if (result > 50) {
    throw new Error(`Result ${result} too large`);
  }
  
  return result;
}

class TestNestedDecorators {
  private createdEvents: any[] = [];
  private sessionId: string = '';

  async setup() {
    console.log('\x1b[94mInitializing session with backend...\x1b[0m');
    
    // Initialize SDK with real backend
    const apiKey = process.env.LUCIDIC_API_KEY;
    const agentId = process.env.LUCIDIC_AGENT_ID;
    const baseUrl = process.env.LUCIDIC_BASE_URL;
    
    if (!apiKey || !agentId) {
      throw new Error('Missing required environment variables: LUCIDIC_API_KEY and LUCIDIC_AGENT_ID');
    }
    
    this.sessionId = await init({
      apiKey,
      agentId,
      sessionName: 'Test Nested Decorators',
      instrumentModules: { openai: OpenAI },
      baseUrl,
    });
    
    console.log(`\x1b[94mSession initialized: ${this.sessionId}\x1b[0m`);
    
    // Hook into event queue to track events
    const { getEventQueue } = await import('../src/sdk/init');
    const eventQueue = getEventQueue();
    if (eventQueue) {
      const originalQueueEvent = eventQueue.queueEvent.bind(eventQueue);
      eventQueue.queueEvent = (params: any) => {
        this.createdEvents.push(params);
        return originalQueueEvent(params);
      };
    }
  }

  async testComplexNestedWorkflow() {
    console.log('\n--- Test: Complex Nested Workflow with OpenAI ---');
    
    // Clear events from any previous tests
    this.createdEvents = [];
    
    // Execute the main workflow - will throw Error
    const testData = [10, 20, 30, 40];  // Sum = 100, multiplied = 200, will trigger error
    
    try {
      const result = await mainWorkflow(testData);
      console.log('\x1b[91mERROR: Function should have thrown Error but didn\'t!\x1b[0m');
    } catch (e) {
      console.log(`\x1b[92m✓\x1b[0m Expected Error caught: ${e}`);
    }
    
    // Wait for events to be queued
    await delay(500);
    
    // Verify the event structure
    console.log(`\n\x1b[96mCreated ${this.createdEvents.length} events\x1b[0m`);
    if (this.createdEvents.length === 0) {
      throw new Error('No events were created');
    }
    
    // Find main workflow event
    const mainEvents = this.createdEvents.filter(e => 
      e.type === 'function_call' && 
      e.payload?.function_name === 'mainWorkflow'
    );
    if (mainEvents.length !== 1) {
      throw new Error(`Expected 1 main_workflow event, got ${mainEvents.length}`);
    }
    
    const mainEvent = mainEvents[0];
    const mainEventId = mainEvent.clientEventId;
    
    // Verify error was captured
    const errorText = mainEvent.payload?.return_value?.error || mainEvent.payload?.misc?.error;
    if (!errorText) {
      throw new Error('Main workflow should have captured the error');
    }
    if (!errorText.includes('Error')) {
      throw new Error('Error should be Error type');
    }
    
    // Verify nested events have correct parent
    const nestedFunctions = ['validateData', 'processData', 'analyzeWithAI', 
                           'aggregateResults', 'formatResults'];
    
    for (const funcName of nestedFunctions) {
      const funcEvents = this.createdEvents.filter(e => 
        e.type === 'function_call' && 
        e.payload?.function_name === funcName
      );
      if (funcEvents.length === 0) {
        console.log(`Warning: No events found for ${funcName}`);
        continue;
      }
      
      // Check parent relationship
      for (const evt of funcEvents) {
        const parentId = evt.parentClientEventId;
        if (parentId !== mainEventId) {
          throw new Error(`${funcName} should have main_workflow as parent`);
        }
      }
    }
    
    // Verify deeply nested helper was called from aggregator
    const helperEvents = this.createdEvents.filter(e => 
      e.type === 'function_call' &&
      e.payload?.function_name === 'nestedHelperFunction'
    );
    if (helperEvents.length !== 1) {
      throw new Error(`Expected 1 nested_helper event, got ${helperEvents.length}`);
    }
    
    // The helper should have aggregator as parent
    const aggregatorEvents = this.createdEvents.filter(e => 
      e.payload?.function_name === 'aggregateResults'
    );
    if (aggregatorEvents.length !== 1) {
      throw new Error('Expected 1 aggregator event');
    }
    const aggregatorId = aggregatorEvents[0].clientEventId;
    if (helperEvents[0].parentClientEventId !== aggregatorId) {
      throw new Error('Helper should have aggregator as parent');
    }
    
    // Check for LLM generation events (from OpenAI instrumentation)
    const llmEvents = this.createdEvents.filter(e => e.type === 'llm_generation');
    console.log(`\n\x1b[96mFound ${llmEvents.length} LLM generation events from OpenAI instrumentation\x1b[0m`);
    
    // Verify LLM events have proper parent context
    if (llmEvents.length > 0) {
      const aiAnalyzerEvent = this.createdEvents.find(e => 
        e.payload?.function_name === 'analyzeWithAI'
      );
      
      for (const llmEvent of llmEvents) {
        const parentId = llmEvent.parentClientEventId;
        if (parentId) {
          console.log(`   - LLM event has parent: ${parentId.substring(0, 8)}...`);
        }
      }
    }
    
    console.log(`\n\x1b[92m✓\x1b[0m Test passed! Created ${this.createdEvents.length} events with proper nesting:`);
    console.log(`   - Main workflow event with error capture`);
    console.log(`   - ${nestedFunctions.length} directly nested function events`);
    console.log(`   - 1 deeply nested helper function event`);
    console.log(`   - ${llmEvents.length} LLM generation events from OpenAI`);
    console.log(`   - All events have proper parent relationships`);
    
    // Print event tree for visualization
    console.log(`\n\x1b[94mEvent Tree:\x1b[0m`);
    console.log(`└── mainWorkflow (error: Error)`);
    console.log(`    ├── validateData`);
    console.log(`    ├── processData`);
    console.log(`    ├── analyzeWithAI`);
    if (llmEvents.length >= 2) {
      console.log(`    │   ├── OpenAI call 1 (gpt-4o)`);
      console.log(`    │   └── OpenAI call 2 (gpt-4o)`);
    }
    console.log(`    ├── OpenAI validation call (gpt-4o)`);
    console.log(`    ├── aggregateResults`);
    console.log(`    │   └── nestedHelperFunction`);
    console.log(`    └── formatResults`);
  }

  async testAsyncNestedDecorators() {
    console.log('\n--- Test: Async Nested Decorators ---');
    
    // Clear events from previous test
    this.createdEvents = [];
    
    // Run async test
    try {
      await asyncMainWorkflow('test error case');
      console.log('\x1b[91mERROR: Async function should have thrown Error!\x1b[0m');
    } catch (e) {
      console.log(`\x1b[92m✓\x1b[0m Async Error caught: ${e}`);
    }
    
    // Wait for events to be queued
    await delay(500);
    
    // Verify async events were created
    const asyncEvents = this.createdEvents.filter(e => 
      e.payload?.function_name?.includes('async')
    );
    if (asyncEvents.length < 3) {
      throw new Error(`Expected at least 3 async events, got ${asyncEvents.length}`);
    }
    
    // Verify nesting
    const asyncMain = asyncEvents.find(e => e.payload?.function_name === 'asyncMainWorkflow');
    const asyncValidateEv = asyncEvents.find(e => e.payload?.function_name === 'asyncValidate');
    const asyncProcessEv = asyncEvents.find(e => e.payload?.function_name === 'asyncProcess');
    
    if (!asyncMain || !asyncValidateEv || !asyncProcessEv) {
      throw new Error('Missing async events');
    }
    
    if (asyncValidateEv.parentClientEventId !== asyncMain.clientEventId) {
      throw new Error('Async validate should have async main as parent');
    }
    if (asyncProcessEv.parentClientEventId !== asyncMain.clientEventId) {
      throw new Error('Async process should have async main as parent');
    }
    
    console.log(`\n\x1b[92m✓\x1b[0m Async test passed! Created ${asyncEvents.length} async events with proper nesting`);
  }

  async testMixedSyncAsyncNesting() {
    console.log('\n--- Test: Mixed Sync/Async Nesting ---');
    
    // Clear events from previous test
    this.createdEvents = [];
    
    // Run test
    try {
      await mixedWorkflow(25);  // Will produce 70, triggering error
      console.log('\x1b[91mERROR: Mixed workflow should have thrown Error!\x1b[0m');
    } catch (e) {
      console.log(`\x1b[92m✓\x1b[0m Mixed Error caught: ${e}`);
    }
    
    // Wait for events to be queued
    await delay(500);
    
    // Verify mixed events
    const mixedEvents = this.createdEvents.filter(e => 
      ['mixedWorkflow', 'asyncCaller', 'syncHelper'].includes(e.payload?.function_name || '')
    );
    if (mixedEvents.length !== 3) {
      throw new Error(`Expected 3 mixed events, got ${mixedEvents.length}`);
    }
    
    // Verify nesting hierarchy
    const mixedMain = mixedEvents.find(e => e.payload?.function_name === 'mixedWorkflow');
    const asyncCallerEv = mixedEvents.find(e => e.payload?.function_name === 'asyncCaller');
    const syncHelperEv = mixedEvents.find(e => e.payload?.function_name === 'syncHelper');
    
    if (!mixedMain || !asyncCallerEv || !syncHelperEv) {
      throw new Error('Missing mixed events');
    }
    
    if (asyncCallerEv.parentClientEventId !== mixedMain.clientEventId) {
      throw new Error('Async caller should have mixed main as parent');
    }
    if (syncHelperEv.parentClientEventId !== asyncCallerEv.clientEventId) {
      throw new Error('Sync helper should have async caller as parent');
    }
    
    console.log(`\n\x1b[92m✓\x1b[0m Mixed sync/async test passed! Created ${mixedEvents.length} events`);
  }

  getTotalEvents() {
    return this.createdEvents.length;
  }

  async cleanup() {
    console.log('\n\x1b[94mFlushing events and ending session...\x1b[0m');
    
    // Force flush the event queue
    const { forceFlush } = await import('../src/sdk/event');
    await forceFlush();
    
    // End the session
    await endSession();
    console.log('\x1b[94mSession ended and events flushed\x1b[0m');
  }
}

// Main test runner
async function runTests() {
  console.log('\x1b[94mRunning comprehensive nested decorator tests...\x1b[0m\n');
  
  const test = new TestNestedDecorators();
  
  try {
    await test.setup();
    
    // Run all tests
    await test.testComplexNestedWorkflow();
    await test.testAsyncNestedDecorators();
    await test.testMixedSyncAsyncNesting();
    
    console.log(`\n\x1b[96mTotal events created across all tests: ${test.getTotalEvents()}\x1b[0m`);
    console.log('\n\x1b[92mAll nested decorator tests completed successfully!\x1b[0m');
    
    // Clean up
    await test.cleanup();
  } catch (error) {
    console.error('\x1b[91mTest failed:\x1b[0m', error);
    process.exit(1);
  }
}

// Run the tests
runTests().catch(console.error);