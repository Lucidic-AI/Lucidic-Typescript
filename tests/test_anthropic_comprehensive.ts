#!/usr/bin/env node
/**
 * Comprehensive Anthropic SDK tests - validates correct information is tracked
 * Run with: npx ts-node tests/test_anthropic_comprehensive.ts
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import * as lai from '../src';
import dotenv from 'dotenv';
// Anthropic will be imported dynamically after lai.init()

// Load environment variables
dotenv.config();

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
  console.error('[ERROR] Missing ANTHROPIC_API_KEY environment variable');
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

// Test runner
class TestRunner {
  private anthropic: any; // Will be Anthropic instance
  private AnthropicClass: any; // Will store the Anthropic class
  private testsPassed = 0;
  private testsFailed = 0;

  constructor() {
    // Anthropic instance will be created after lai.init() in setup()
  }

  async setup() {
    console.log('Setting up Anthropic comprehensive tests...\n');
    
    // Initialize Lucidic FIRST before importing Anthropic
    await lai.init({
      apiKey: process.env.LUCIDIC_API_KEY,
      agentId: process.env.LUCIDIC_AGENT_ID,
      sessionName: 'Anthropic Unit Tests',
      providers: ['anthropic']
    });
    
    // NOW import Anthropic dynamically after instrumentation is set up
    console.log('Importing Anthropic after instrumentation setup...');
    this.AnthropicClass = (await import('@anthropic-ai/sdk')).default;
    
    // Create Anthropic instance
    this.anthropic = new this.AnthropicClass({ apiKey: ANTHROPIC_API_KEY });
    
    // Create test step
    await lai.createStep({
      state: 'Testing Anthropic SDK',
      action: 'Run unit tests',
      goal: 'Validate all Anthropic functionality'
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
  async testBasicMessageCompletion() {
    const response = await this.anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 50,
      messages: [
        { role: 'user', content: 'Say "test passed" and nothing else.' }
      ]
    });
    
    // Validate response
    if (!response || !response.content || response.content.length === 0) {
      throw new Error('Invalid response structure');
    }
    
    const textContent = response.content.find((c: any) => c.type === 'text');
    if (!textContent || textContent.type !== 'text' || !textContent.text) {
      throw new Error('No text content in response');
    }
    
    // Validate usage
    if (!response.usage || !response.usage.input_tokens || !response.usage.output_tokens) {
      throw new Error('Missing usage data');
    }
    
    console.log(`   Response: "${textContent.text.substring(0, 50)}..."`);
    console.log(`   Tokens - Input: ${response.usage.input_tokens}, Output: ${response.usage.output_tokens}`);
  }

  async testStreamingMessage() {
    const stream = await this.anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 100,
      messages: [
        { role: 'user', content: 'Count from 1 to 5, one number per line' }
      ],
      stream: true
    });

    let fullContent = '';
    let chunkCount = 0;
    let messageStart = false;
    let messageStop = false;

    for await (const event of stream) {
      if (event.type === 'message_start') {
        messageStart = true;
      } else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        fullContent += event.delta.text;
        chunkCount++;
      } else if (event.type === 'message_stop') {
        messageStop = true;
      }
    }

    if (!messageStart || !messageStop) {
      throw new Error('Stream missing start or stop events');
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

  async testSystemMessage() {
    const response = await this.anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 100,
      system: 'You are a helpful assistant who speaks like a pirate. Use "arr", "matey", and other pirate expressions.',
      messages: [
        { role: 'user', content: 'Hello! How are you today?' }
      ]
    });

    const textContent = response.content.find((c: any) => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text content');
    }

    const content = textContent.text.toLowerCase();
    const pirateWords = ['arr', 'ahoy', 'matey', 'ye', 'sail', 'sea', 'ship', 'pirate'];
    const hasPirateSpeak = pirateWords.some(word => content.includes(word));

    if (!hasPirateSpeak) {
      throw new Error('Response does not contain pirate speak');
    }

    console.log(`   Pirate response: "${content.substring(0, 80)}..."`);
  }

  async testVisionImageInput() {
    const imageBuffer = readFileSync(TEST_IMAGE_PATH);
    const base64Image = imageBuffer.toString('base64');
    
    const response = await this.anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 200,
      messages: [
        {
          role: 'user',
          content: [
            { 
              type: 'text', 
              text: 'What do you see in this image? Describe the main elements visible.' 
            },
            { 
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: base64Image
              }
            }
          ]
        }
      ]
    });

    const textContent = response.content.find((c: any) => c.type === 'text');
    if (!textContent || textContent.type !== 'text' || !textContent.text) {
      throw new Error('No text description of image');
    }

    // Should contain relevant keywords
    const lowerContent = textContent.text.toLowerCase();
    const hasRelevantContent = ['runway', 'airport', 'plane', 'aerial', 'view', 'aircraft', 'terminal']
      .some(keyword => lowerContent.includes(keyword));
    
    if (!hasRelevantContent) {
      throw new Error('Image description does not contain expected content');
    }

    console.log(`   Description length: ${textContent.text.length} chars`);
    console.log(`   First 100 chars: ${textContent.text.substring(0, 100)}...`);
  }

  async testMultipleTurnConversation() {
    // First turn
    const response1 = await this.anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 50,
      messages: [
        { role: 'user', content: 'What is 15 + 27?' }
      ]
    });

    const answer1 = response1.content.find((c: any) => c.type === 'text');
    if (!answer1 || answer1.type !== 'text' || !answer1.text.includes('42')) {
      throw new Error('First calculation incorrect');
    }

    // Second turn with context
    const response2 = await this.anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 50,
      messages: [
        { role: 'user', content: 'What is 15 + 27?' },
        { role: 'assistant', content: answer1.text },
        { role: 'user', content: 'Now multiply that result by 2' }
      ]
    });

    const answer2 = response2.content.find((c: any) => c.type === 'text');
    if (!answer2 || answer2.type !== 'text' || !answer2.text.includes('84')) {
      throw new Error('Second calculation incorrect');
    }

    console.log(`   Turn 1: ${answer1.text.substring(0, 50)}...`);
    console.log(`   Turn 2: ${answer2.text.substring(0, 50)}...`);
  }

  async testDifferentTemperatures() {
    const prompt = 'Generate a creative name for a new coffee shop. Just give the name, nothing else.';
    
    // Low temperature (more deterministic)
    const lowTempResponses: string[] = [];
    
    for (let i = 0; i < 2; i++) {
      const response = await this.anthropic.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 20,
        temperature: 0,
        messages: [{ role: 'user', content: prompt }]
      });
      const text = response.content.find((c: any) => c.type === 'text');
      if (text && text.type === 'text') {
        lowTempResponses.push(text.text);
      }
    }
    
    // High temperature (more creative)
    const creativeResponse = await this.anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 20,
      temperature: 1,
      messages: [{ role: 'user', content: prompt }]
    });
    
    const creativeText = creativeResponse.content.find((c: any) => c.type === 'text');
    
    console.log(`   Low temp response 1: ${lowTempResponses[0]}`);
    console.log(`   Low temp response 2: ${lowTempResponses[1]}`);
    console.log(`   High temp response: ${creativeText?.type === 'text' ? creativeText.text : 'N/A'}`);
  }

  async testToolUse() {
    const response = await this.anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 300,
      tools: [
        {
          name: 'get_weather',
          description: 'Get the current weather for a location',
          input_schema: {
            type: 'object',
            properties: {
              location: { 
                type: 'string', 
                description: 'The city and state/country' 
              },
              unit: { 
                type: 'string', 
                enum: ['celsius', 'fahrenheit'],
                description: 'Temperature unit preference'
              }
            },
            required: ['location']
          }
        }
      ],
      messages: [
        { role: 'user', content: "What's the weather like in Paris, France?" }
      ]
    });

    // Check for tool use in response
    const toolUse = response.content.find((c: any) => c.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use') {
      throw new Error('No tool use in response');
    }

    if (toolUse.name !== 'get_weather') {
      throw new Error('Wrong tool called');
    }

    const input = toolUse.input as any;
    if (!input.location || !input.location.toLowerCase().includes('paris')) {
      throw new Error('Location not correctly extracted');
    }

    console.log(`   Tool called: ${toolUse.name}`);
    console.log(`   Tool ID: ${toolUse.id}`);
    console.log(`   Arguments: ${JSON.stringify(input)}`);
  }

  async testMultipleMessagesWithImages() {
    const imageBuffer = readFileSync(TEST_IMAGE_PATH);
    const base64Image = imageBuffer.toString('base64');
    
    const response = await this.anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 200,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'I will show you an image of an airport.' },
            { 
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: base64Image
              }
            }
          ]
        },
        {
          role: 'assistant',
          content: 'I can see the image. What would you like to know about it?'
        },
        {
          role: 'user',
          content: 'Are there any text labels or markings visible in the image?'
        }
      ]
    });

    const textContent = response.content.find((c: any) => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No response about image markings');
    }

    console.log(`   Response length: ${textContent.text.length} chars`);
    console.log(`   Mentions markings: ${textContent.text.toLowerCase().includes('mark') || textContent.text.toLowerCase().includes('text')}`);
  }

  async testJSONResponse() {
    const response = await this.anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 150,
      messages: [
        { 
          role: 'user', 
          content: `Extract the following information and return ONLY valid JSON:
          "John Smith is 35 years old and works as a software engineer skilled in Python and JavaScript."
          
          Format: {"name": "...", "age": ..., "occupation": "...", "skills": [...]}`
        }
      ]
    });

    const textContent = response.content.find((c: any) => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text response');
    }

    // Extract JSON from response
    const jsonMatch = textContent.text.match(/{[\s\S]*}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.name || !parsed.age || !parsed.occupation || !parsed.skills) {
      throw new Error('JSON missing required fields');
    }

    console.log(`   Parsed JSON: ${JSON.stringify(parsed)}`);
  }

  async testLongContextHandling() {
    // Create a long context
    const longStory = `In the year 2157, humanity had finally achieved faster-than-light travel. 
    The first colony ship, named "New Horizon", was preparing for its maiden voyage to Proxima Centauri. 
    Captain Sarah Chen stood on the bridge, looking at the stars. `.repeat(20);
    
    const response = await this.anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 100,
      messages: [
        { role: 'user', content: longStory },
        { role: 'assistant', content: 'I understand. This is a science fiction story about space exploration.' },
        { role: 'user', content: 'What was the name of the ship and who was the captain?' }
      ]
    });

    const textContent = response.content.find((c: any) => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No response');
    }

    const content = textContent.text;
    if (!content.includes('New Horizon') || !content.includes('Sarah Chen')) {
      throw new Error('Failed to recall details from long context');
    }

    console.log(`   Context length: ${longStory.length} chars`);
    console.log(`   Correctly recalled: Ship and Captain names`);
  }

  async testMaxTokensRespected() {
    const response = await this.anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 10, // Very low limit
      messages: [
        { role: 'user', content: 'Tell me a long story about a dragon' }
      ]
    });

    const textContent = response.content.find((c: any) => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text content');
    }

    // Check that output was truncated
    const wordCount = textContent.text.split(/\s+/).length;
    if (wordCount > 15) { // Allow some margin
      throw new Error('Output not properly truncated by max_tokens');
    }

    console.log(`   Output tokens limited: ${response.usage.output_tokens}`);
    console.log(`   Word count: ${wordCount}`);
  }

  async testClaude35Sonnet() {
    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 150,
        messages: [
          { 
            role: 'user', 
            content: 'Write a haiku about unit testing in TypeScript' 
          }
        ]
      });

      const textContent = response.content.find((c: any) => c.type === 'text');
      if (!textContent || textContent.type !== 'text') {
        throw new Error('No haiku in response');
      }

      // Haiku should have 3 lines
      const lines = textContent.text.trim().split('\n').filter((line: any) => line.trim().length > 0);
      if (lines.length < 3) {
        throw new Error('Haiku does not have proper structure');
      }

      const lowerContent = textContent.text.toLowerCase();
      if (!lowerContent.includes('test') && !lowerContent.includes('type')) {
        throw new Error('Haiku not about testing/TypeScript');
      }

      console.log(`   Claude 3.5 Sonnet haiku:`);
      lines.forEach((line: any) => console.log(`   ${line}`));
    } catch (error: any) {
      if (error.status === 404 || error.message?.includes('model_not_found')) {
        console.log('   [WARNING] Claude 3.5 Sonnet not available, skipping');
      } else {
        throw error;
      }
    }
  }

  async testAsyncBatchOperations() {
    // Test multiple async operations
    const prompts = [
      'What is 2 + 2?',
      'What is the capital of France?',
      'What color is the sky?'
    ];

    const promises = prompts.map(prompt => 
      this.anthropic.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 20,
        messages: [{ role: 'user', content: prompt }]
      })
    );

    const responses = await Promise.all(promises);
    
    if (responses.length !== 3) {
      throw new Error('Not all async requests completed');
    }

    // Validate each response
    const answers = responses.map(resp => {
      const text = resp.content.find((c: any) => c.type === 'text');
      return text?.type === 'text' ? text.text : '';
    });

    if (!answers[0].includes('4')) throw new Error('Math answer wrong');
    if (!answers[1].toLowerCase().includes('paris')) throw new Error('Geography answer wrong');
    if (!answers[2].toLowerCase().includes('blue') && !answers[2].toLowerCase().includes('sky')) {
      throw new Error('Color answer wrong');
    }

    console.log(`   Completed ${responses.length} async requests`);
    console.log(`   All answers correct`);
  }

  async runAllTests() {
    await this.setup();

    // Run all tests
    await this.runTest('Basic Message Completion', () => this.testBasicMessageCompletion());
    await this.runTest('Streaming Message', () => this.testStreamingMessage());
    await this.runTest('System Message', () => this.testSystemMessage());
    await this.runTest('Vision - Image Input', () => this.testVisionImageInput());
    await this.runTest('Multiple Turn Conversation', () => this.testMultipleTurnConversation());
    await this.runTest('Different Temperatures', () => this.testDifferentTemperatures());
    await this.runTest('Tool Use (Function Calling)', () => this.testToolUse());
    await this.runTest('Multiple Messages with Images', () => this.testMultipleMessagesWithImages());
    await this.runTest('JSON Response', () => this.testJSONResponse());
    await this.runTest('Long Context Handling', () => this.testLongContextHandling());
    await this.runTest('Max Tokens Respected', () => this.testMaxTokensRespected());
    await this.runTest('Claude 3.5 Sonnet Features', () => this.testClaude35Sonnet());
    await this.runTest('Async Batch Operations', () => this.testAsyncBatchOperations());

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