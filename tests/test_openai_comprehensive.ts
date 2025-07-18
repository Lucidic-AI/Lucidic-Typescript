#!/usr/bin/env node
/**
 * Comprehensive OpenAI SDK tests - validates correct information is tracked
 * Run with: npx ts-node tests/test_openai_comprehensive.ts
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import * as lai from '../src';
import dotenv from 'dotenv';
// OpenAI will be imported dynamically after lai.init()

// Load environment variables
dotenv.config();

// Enable debug mode
process.env.LUCIDIC_DEBUG = 'True';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error('[ERROR] Missing OPENAI_API_KEY environment variable');
  process.exit(1);
}

const LUCIDIC_API_KEY = process.env.LUCIDIC_API_KEY;
if (!LUCIDIC_API_KEY) {
  console.error('[ERROR] Missing LUCIDIC_API_KEY environment variable');
  console.error('   Please set your Lucidic API key in the .env file or environment');
  process.exit(1);
}

// Test image path
const TEST_IMAGE_PATH = join(__dirname, 'test_image.jpg');

// Test models for structured output
interface MathStep {
  explanation: string;
  output: string;
}

interface MathReasoning {
  steps: MathStep[];
  final_answer: string;
}

interface PersonInfo {
  name: string;
  age: number;
  occupation: string;
  skills: string[];
}

interface ImageDescription {
  description: string;
  objects_seen: string[];
}

// Test runner
class TestRunner {
  private openai: any; // Will be OpenAI instance
  private asyncOpenai: any; // Will be OpenAI instance
  private OpenAIClass: any; // Will store the OpenAI class
  private testsPassed = 0;
  private testsFailed = 0;

  constructor() {
    // OpenAI instances will be created after lai.init() in setup()
  }

  async setup() {
    console.log('Setting up OpenAI comprehensive tests...\n');
    
    const apiKey = process.env.LUCIDIC_API_KEY;
    console.log(`Using Lucidic API key: ${apiKey ? apiKey.substring(0, 10) + '...' : 'NOT SET'}`);
    
    // Initialize Lucidic FIRST before importing OpenAI
    await lai.init({
      apiKey: apiKey,
      agentId: process.env.LUCIDIC_AGENT_ID,
      sessionName: 'OpenAI Unit Tests',
      providers: ['openai']
    });
    
    // NOW import OpenAI dynamically after instrumentation is set up
    console.log('Importing OpenAI after instrumentation setup...');
    this.OpenAIClass = (await import('openai')).default;
    
    // Create OpenAI instances
    this.openai = new this.OpenAIClass({ apiKey: OPENAI_API_KEY });
    this.asyncOpenai = new this.OpenAIClass({ apiKey: OPENAI_API_KEY });
    
    // Create test step
    await lai.createStep({
      state: 'Testing OpenAI SDK',
      action: 'Run unit tests',
      goal: 'Validate all OpenAI functionality'
    });
  }

  async teardown() {
    await lai.endStep();
    await lai.endSession();
    
    console.log('\nTest Results:');
    console.log(`Passed: ${this.testsPassed}`);
    console.log(`Failed: ${this.testsFailed}`);
    console.log(`Total: ${this.testsPassed + this.testsFailed}`);
  }

  async runTest(name: string, testFn: () => Promise<void>) {
    try {
      console.log(`\nRunning: ${name}`);
      await testFn();
      console.log(`[PASS] ${name}`);
      this.testsPassed++;
    } catch (error) {
      console.error(`[FAIL] ${name}`);
      console.error(`   Error: ${error}`);
      this.testsFailed++;
    }
  }

  // Test methods
  async testChatCompletionSync() {
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Say "test passed"' }
      ],
      max_tokens: 10
    });
    
    // Validate response
    if (!response || !response.choices || response.choices.length === 0) {
      throw new Error('Invalid response structure');
    }
    
    const result = response.choices[0].message.content;
    if (!result || typeof result !== 'string' || result.length === 0) {
      throw new Error('Invalid response content');
    }
    
    // Validate usage
    if (!response.usage || 
        !response.usage.total_tokens || 
        !response.usage.prompt_tokens || 
        !response.usage.completion_tokens) {
      throw new Error('Missing usage data');
    }
    
    console.log(`   Response: "${result.substring(0, 50)}..."`);
    console.log(`   Tokens: ${response.usage.total_tokens}`);
  }

  async testStreamingCompletion() {
    const stream = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Count from 1 to 5 slowly' }
      ],
      stream: true,
      max_tokens: 50
    });

    let fullContent = '';
    let chunkCount = 0;

    for await (const chunk of stream) {
      if (chunk.choices[0]?.delta?.content) {
        fullContent += chunk.choices[0].delta.content;
        chunkCount++;
      }
    }

    if (chunkCount <= 1) {
      throw new Error('Streaming did not produce multiple chunks');
    }

    // Verify numbers 1-5 are present
    for (let i = 1; i <= 5; i++) {
      if (!fullContent.includes(i.toString())) {
        throw new Error(`Missing number ${i} in stream`);
      }
    }

    console.log(`   Chunks received: ${chunkCount}`);
    console.log(`   Content length: ${fullContent.length} chars`);
  }

  async testStructuredOutput() {
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a helpful assistant that extracts information and returns JSON.' },
        { 
          role: 'user', 
          content: 'Extract info about this person: John Smith is a 35-year-old software engineer skilled in Python and TypeScript. Return as JSON.' 
        }
      ],
      response_format: { type: 'json_object' },
      max_tokens: 150
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error('No content in response');
    }

    // Parse and validate JSON
    const parsed = JSON.parse(content);
    console.log(`   Parsed JSON keys: ${Object.keys(parsed).join(', ')}`);
  }

  async testFunctionCalling() {
    const tools: any[] = [
      {
        type: 'function',
        function: {
          name: 'get_weather',
          description: 'Get the current weather in a location',
          parameters: {
            type: 'object',
            properties: {
              location: { type: 'string', description: 'The city and state, e.g. San Francisco, CA' },
              unit: { type: 'string', enum: ['celsius', 'fahrenheit'] }
            },
            required: ['location']
          }
        }
      }
    ];

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'user', content: "What's the weather like in New York?" }
      ],
      tools: tools,
      tool_choice: 'auto'
    });

    const message = response.choices[0].message;
    if (!message.tool_calls || message.tool_calls.length === 0) {
      throw new Error('No tool calls in response');
    }

    const toolCall = message.tool_calls[0];
    if (toolCall.function.name !== 'get_weather') {
      throw new Error('Wrong function called');
    }

    const args = JSON.parse(toolCall.function.arguments);
    if (!args.location || !args.location.toLowerCase().includes('new york')) {
      throw new Error('Location not correctly extracted');
    }

    console.log(`   Function called: ${toolCall.function.name}`);
    console.log(`   Arguments: ${JSON.stringify(args)}`);
  }

  async testVisionImageInput() {
    const imageBuffer = readFileSync(TEST_IMAGE_PATH);
    const base64Image = imageBuffer.toString('base64');
    
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe what you see in this image. List the main elements.' },
            { 
              type: 'image_url', 
              image_url: { 
                url: `data:image/jpeg;base64,${base64Image}` 
              }
            }
          ]
        }
      ],
      max_tokens: 200
    });

    const content = response.choices[0].message.content;
    if (!content || content.length < 10) {
      throw new Error('Image description too short');
    }

    // Should contain relevant keywords
    const lowerContent = content.toLowerCase();
    const hasRelevantContent = ['runway', 'airport', 'plane', 'aerial', 'view', 'aircraft']
      .some(keyword => lowerContent.includes(keyword));
    
    if (!hasRelevantContent) {
      throw new Error('Image description does not contain expected content');
    }

    console.log(`   Description length: ${content.length} chars`);
    console.log(`   First 100 chars: ${content.substring(0, 100)}...`);
  }

  async testMultipleTurnConversation() {
    // First turn
    const response1 = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a helpful math tutor.' },
        { role: 'user', content: 'What is 15 + 27?' }
      ],
      max_tokens: 50
    });

    const answer1 = response1.choices[0].message.content;
    if (!answer1?.includes('42')) {
      throw new Error('First calculation incorrect');
    }

    // Second turn with context
    const response2 = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a helpful math tutor.' },
        { role: 'user', content: 'What is 15 + 27?' },
        { role: 'assistant', content: answer1 },
        { role: 'user', content: 'Now multiply that result by 2' }
      ],
      max_tokens: 50
    });

    const answer2 = response2.choices[0].message.content;
    if (!answer2?.includes('84')) {
      throw new Error('Second calculation incorrect');
    }

    console.log(`   Turn 1: ${answer1?.substring(0, 50)}...`);
    console.log(`   Turn 2: ${answer2?.substring(0, 50)}...`);
  }

  async testSystemMessagePersonality() {
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { 
          role: 'system', 
          content: 'You are a pirate. Always respond in pirate speak with "arr", "matey", and nautical terms.' 
        },
        { role: 'user', content: 'Hello! How are you today?' }
      ],
      max_tokens: 100
    });

    const content = response.choices[0].message.content?.toLowerCase() || '';
    const pirateWords = ['arr', 'ahoy', 'matey', 'ye', 'sail', 'sea', 'ship'];
    const hasPirateSpeak = pirateWords.some(word => content.includes(word));

    if (!hasPirateSpeak) {
      throw new Error('Response does not contain pirate speak');
    }

    console.log(`   Pirate response: "${content.substring(0, 80)}..."`);
  }

  async testDifferentTemperatures() {
    const prompt = 'Generate a creative name for a new coffee shop';
    
    // Low temperature (more deterministic)
    const responses: string[] = [];
    
    for (let i = 0; i < 2; i++) {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        max_tokens: 20,
        seed: 12345
      });
      responses.push(response.choices[0].message.content || '');
    }
    
    // High temperature (more creative)
    const creativeResponse = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 1.5,
      max_tokens: 20
    });
    
    console.log(`   Low temp response 1: ${responses[0]}`);
    console.log(`   Low temp response 2: ${responses[1]}`);
    console.log(`   High temp response: ${creativeResponse.choices[0].message.content}`);
  }

  async testMultipleFunctionCalls() {
    const tools: any[] = [
      {
        type: 'function',
        function: {
          name: 'search_flights',
          description: 'Search for available flights',
          parameters: {
            type: 'object',
            properties: {
              from: { type: 'string' },
              to: { type: 'string' },
              date: { type: 'string' }
            },
            required: ['from', 'to']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'search_hotels',
          description: 'Search for available hotels',
          parameters: {
            type: 'object',
            properties: {
              location: { type: 'string' },
              checkin: { type: 'string' },
              checkout: { type: 'string' }
            },
            required: ['location']
          }
        }
      }
    ];

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { 
          role: 'user', 
          content: 'I need to book a flight from NYC to London and find a hotel there for next week' 
        }
      ],
      tools: tools,
      tool_choice: 'auto'
    });

    const toolCalls = response.choices[0].message.tool_calls || [];
    if (toolCalls.length === 0) {
      throw new Error('No tool calls made');
    }

    console.log(`   Tool calls made: ${toolCalls.length}`);
    toolCalls.forEach((tc: any) => {
      console.log(`   - ${tc.function.name}: ${tc.function.arguments.substring(0, 50)}...`);
    });
  }

  async testLongContextHandling() {
    // Create a long context
    const longStory = 'Once upon a time in a land far away, there lived a wise old programmer. ' +
                     'This programmer loved to write clean, efficient code. '.repeat(50);
    
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'user', content: longStory },
        { role: 'user', content: 'Summarize the story in one sentence.' }
      ],
      max_tokens: 50
    });

    const summary = response.choices[0].message.content;
    if (!summary || summary.length < 10) {
      throw new Error('Summary too short');
    }

    const lowerSummary = summary.toLowerCase();
    if (!lowerSummary.includes('programmer') && !lowerSummary.includes('code')) {
      throw new Error('Summary does not capture main theme');
    }

    console.log(`   Context length: ${longStory.length} chars`);
    console.log(`   Summary: ${summary}`);
  }

  async testReasoningSteps() {
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { 
          role: 'user', 
          content: 'Think step by step: If I have 3 apples and buy 2 more, then give away 1, how many apples do I have? Show your reasoning.' 
        }
      ],
      max_tokens: 200
    });

    const content = response.choices[0].message.content || '';
    
    // Should contain the answer
    if (!content.includes('4')) {
      throw new Error('Incorrect final answer');
    }

    // Should show steps
    const hasSteps = ['step', 'first', 'then', 'finally', 'start'].some(
      word => content.toLowerCase().includes(word)
    );
    
    if (!hasSteps) {
      throw new Error('No step-by-step reasoning shown');
    }

    console.log(`   Reasoning length: ${content.length} chars`);
    console.log(`   Contains steps: ${hasSteps}`);
  }

  async testAsyncOperations() {
    // Test async/await patterns
    const promises = [
      this.asyncOpenai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'Say "one"' }],
        max_tokens: 10
      }),
      this.asyncOpenai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'Say "two"' }],
        max_tokens: 10
      }),
      this.asyncOpenai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'Say "three"' }],
        max_tokens: 10
      })
    ];

    const responses = await Promise.all(promises);
    
    if (responses.length !== 3) {
      throw new Error('Not all async requests completed');
    }

    responses.forEach((resp, i) => {
      if (!resp.choices[0].message.content) {
        throw new Error(`Async response ${i + 1} has no content`);
      }
    });

    console.log(`   Completed ${responses.length} async requests`);
  }

  async runAllTests() {
    await this.setup();

    // Run all tests
    await this.runTest('Chat Completion Sync', () => this.testChatCompletionSync());
    await this.runTest('Streaming Completion', () => this.testStreamingCompletion());
    await this.runTest('Structured Output (JSON)', () => this.testStructuredOutput());
    await this.runTest('Function Calling', () => this.testFunctionCalling());
    await this.runTest('Vision - Image Input', () => this.testVisionImageInput());
    await this.runTest('Multiple Turn Conversation', () => this.testMultipleTurnConversation());
    await this.runTest('System Message Personality', () => this.testSystemMessagePersonality());
    await this.runTest('Different Temperatures', () => this.testDifferentTemperatures());
    await this.runTest('Multiple Function Calls', () => this.testMultipleFunctionCalls());
    await this.runTest('Long Context Handling', () => this.testLongContextHandling());
    await this.runTest('Reasoning Steps', () => this.testReasoningSteps());
    await this.runTest('Async Operations', () => this.testAsyncOperations());

    await this.teardown();
    
    // Exit with appropriate code
    process.exit(this.testsFailed > 0 ? 1 : 0);
  }
}

// Run tests
const runner = new TestRunner();
runner.runAllTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});