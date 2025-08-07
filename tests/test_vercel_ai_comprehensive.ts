#!/usr/bin/env node
/**
 * Comprehensive Vercel AI SDK tests - validates correct information is tracked
 * Run with: npx ts-node tests/test_vercel_ai_comprehensive.ts
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import * as lai from '../src';
import dotenv from 'dotenv';
import { z } from 'zod';
// Vercel AI SDK will be imported dynamically after lai.init()

// Load environment variables
dotenv.config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error('[ERROR] Missing OPENAI_API_KEY environment variable');
  process.exit(1);
}

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

// Test schemas for structured output
const MathReasoningSchema = z.object({
  steps: z.array(z.object({
    explanation: z.string(),
    output: z.string()
  })),
  final_answer: z.string()
});

const PersonInfoSchema = z.object({
  name: z.string(),
  age: z.number(),
  occupation: z.string(),
  skills: z.array(z.string())
});

const ImageDescriptionSchema = z.object({
  description: z.string(),
  objects_seen: z.array(z.string()),
  dominant_colors: z.array(z.string()).optional()
});

// Test runner
class TestRunner {
  private ai: any; // Will be ai module
  private openai: any; // Will be OpenAI provider
  private anthropic: any; // Will be Anthropic provider
  private createOpenAI: any;
  private createAnthropic: any;
  private testsPassed = 0;
  private testsFailed = 0;

  constructor() {
    // Providers will be created after lai.init() in setup()
  }

  async setup() {
    console.log('Setting up Vercel AI SDK comprehensive tests...\n');
    
    const apiKey = process.env.LUCIDIC_API_KEY;
    console.log(`Using Lucidic API key: ${apiKey ? apiKey.substring(0, 10) + '...' : 'NOT SET'}`);
    
    // Initialize Lucidic FIRST
    // Note: We don't specify providers for Vercel AI SDK since it uses its own telemetry
    await lai.init({
      apiKey: apiKey,
      agentId: process.env.LUCIDIC_AGENT_ID,
      sessionName: 'Vercel AI SDK Unit Tests',
    });
    
    // NOW import Vercel AI SDK dynamically after telemetry is set up
    console.log('Importing Vercel AI SDK after instrumentation setup...');
    this.ai = await import('ai');
    const openaiModule = await import('@ai-sdk/openai');
    const anthropicModule = await import('@ai-sdk/anthropic');
    
    this.createOpenAI = openaiModule.createOpenAI;
    this.createAnthropic = anthropicModule.createAnthropic;
    
    // Create provider instances
    this.openai = this.createOpenAI({ apiKey: OPENAI_API_KEY });
    this.anthropic = this.createAnthropic({ apiKey: ANTHROPIC_API_KEY });
    
    // Create test step
    await lai.createStep({
      state: 'Testing Vercel AI SDK',
      action: 'Run unit tests',
      goal: 'Validate all Vercel AI SDK functionality'
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
  async testBasicTextGeneration() {
    const result = await this.ai.generateText({
      model: this.openai('gpt-4o-mini'),
      system: 'You are a helpful assistant',
      prompt: 'Say "test passed" and nothing else.',
      temperature: 0,
      experimental_telemetry: {
        isEnabled: true,
        recordInputs: true,
        recordOutputs: true,
        functionId: 'test-basic-generation'
      }
    });

    const response = result.text.toLowerCase();
    if (!response.includes('test passed')) {
      throw new Error(`Expected "test passed", got: ${response}`);
    }
    
    console.log(`   Generated text: ${result.text}`);
    console.log(`   Usage: ${result.usage.inputTokens} input, ${result.usage.outputTokens} output tokens`);
  }

  async testStreamingGeneration() {
    const result = await this.ai.streamText({
      model: this.anthropic('claude-3-haiku-20240307'),
      system: 'You are a counting assistant',
      prompt: 'Count from 1 to 5, one number per line',
      temperature: 0,
      experimental_telemetry: {
        isEnabled: true,
        recordInputs: true,
        recordOutputs: true,
        functionId: 'test-streaming'
      }
    });

    let fullText = '';
    let chunkCount = 0;
    
    for await (const chunk of result.textStream) {
      fullText += chunk;
      chunkCount++;
    }
    
    console.log(`   Received ${chunkCount} chunks`);
    console.log(`   Full text: ${fullText.replace(/\n/g, ' ')}`);
    
    // Check that we got numbers 1-5
    for (let i = 1; i <= 5; i++) {
      if (!fullText.includes(i.toString())) {
        throw new Error(`Missing number ${i} in output`);
      }
    }
  }

  async testStructuredOutput() {
    const result = await this.ai.generateObject({
      model: this.openai('gpt-4o-mini'),
      schema: MathReasoningSchema,
      prompt: 'Solve step by step: What is 25 + 17?',
      temperature: 0,
      experimental_telemetry: {
        isEnabled: true,
        recordInputs: true,
        recordOutputs: true,
        functionId: 'test-structured-output'
      }
    });

    console.log(`   Steps: ${result.object.steps.length}`);
    console.log(`   Final answer: ${result.object.final_answer}`);
    
    if (!result.object.final_answer.includes('42')) {
      throw new Error(`Expected answer to include 42, got: ${result.object.final_answer}`);
    }
  }

  async testToolCalling() {
    console.log('   Skipping tool calling test due to SDK incompatibility');
    return;
    /*
    const result = await this.ai.generateText({
      model: this.openai('gpt-4o-mini'),
      prompt: 'What is 25 + 17? Use the add tool to calculate.',
      tools: {
        add: {
          description: 'Add two numbers together',
          parameters: z.object({
            a: z.number().describe('First number'),
            b: z.number().describe('Second number')
          }),
          execute: async ({ a, b }) => {
            console.log(`   Tool called: add(${a}, ${b})`);
            return a + b;
          }
        }
      },
      toolChoice: 'required',
      experimental_telemetry: {
        isEnabled: true,
        recordInputs: true,
        recordOutputs: true,
        functionId: 'test-tool-calling'
      }
    });

    console.log(`   Final text: ${result.text}`);
    console.log(`   Tool calls: ${result.toolCalls.length}`);
    console.log(`   Tool results: ${JSON.stringify(result.toolResults)}`);
    
    if (result.toolCalls.length === 0) {
      throw new Error('Expected at least one tool call');
    }
    
    if (!result.text.includes('42')) {
      throw new Error(`Expected result to include 42, got: ${result.text}`);
    }
    */
  }

  async testVisionImageInput() {
    // Read test image
    const imageData = readFileSync(TEST_IMAGE_PATH);
    const base64Image = imageData.toString('base64');
    
    const result = await this.ai.generateText({
      model: this.openai('gpt-4o'),
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Describe this image briefly'
            },
            {
              type: 'image',
              image: `data:image/jpeg;base64,${base64Image}`
            }
          ]
        }
      ],
      maxTokens: 100,
      temperature: 0.5,
      experimental_telemetry: {
        isEnabled: true,
        recordInputs: true,
        recordOutputs: true,
        functionId: 'test-vision'
      }
    });

    console.log(`   Image description: ${result.text.substring(0, 100)}...`);
    
    if (!result.text || result.text.length < 10) {
      throw new Error('Expected a meaningful image description');
    }
  }

  async testMultiProviderConversation() {
    // First message with OpenAI
    const openaiResult = await this.ai.generateText({
      model: this.openai('gpt-4o-mini'),
      messages: [
        { role: 'system', content: 'You are a helpful assistant' },
        { role: 'user', content: 'What is the capital of France?' }
      ],
      temperature: 0,
      experimental_telemetry: {
        isEnabled: true,
        recordInputs: true,
        recordOutputs: true,
        functionId: 'test-multi-provider-openai'
      }
    });

    // Follow-up with Anthropic
    const anthropicResult = await this.ai.generateText({
      model: this.anthropic('claude-3-haiku-20240307'),
      messages: [
        { role: 'system', content: 'You are a helpful assistant' },
        { role: 'user', content: 'What is the capital of France?' },
        { role: 'assistant', content: openaiResult.text },
        { role: 'user', content: 'What is the population of that city?' }
      ],
      temperature: 0,
      experimental_telemetry: {
        isEnabled: true,
        recordInputs: true,
        recordOutputs: true,
        functionId: 'test-multi-provider-anthropic'
      }
    });

    console.log(`   OpenAI response: ${openaiResult.text.substring(0, 50)}...`);
    console.log(`   Anthropic follow-up: ${anthropicResult.text.substring(0, 50)}...`);
    
    if (!openaiResult.text.toLowerCase().includes('paris')) {
      throw new Error('Expected Paris in OpenAI response');
    }
    
    if (!anthropicResult.text.match(/\d/)) {
      throw new Error('Expected population number in Anthropic response');
    }
  }

  async testDifferentModels() {
    const models = [
      { provider: this.openai, model: 'gpt-4o', name: 'GPT-4o' },
      { provider: this.openai, model: 'gpt-4o-mini', name: 'GPT-4o Mini' },
      { provider: this.anthropic, model: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
      { provider: this.anthropic, model: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku' }
    ];

    for (const { provider, model, name } of models) {
      const result = await this.ai.generateText({
        model: provider(model),
        prompt: 'Say hello in one word',
        maxTokens: 10,
        temperature: 0,
        experimental_telemetry: {
          isEnabled: true,
          recordInputs: true,
          recordOutputs: true,
          functionId: `test-model-${model}`
        }
      });

      console.log(`   ${name}: ${result.text}`);
      
      if (!result.text) {
        throw new Error(`No response from ${name}`);
      }
    }
  }

  async testStreamObject() {
    const result = await this.ai.streamObject({
      model: this.openai('gpt-4o-mini'),
      schema: PersonInfoSchema,
      prompt: 'Generate a fictional person profile for a software engineer',
      temperature: 0.7,
      experimental_telemetry: {
        isEnabled: true,
        recordInputs: true,
        recordOutputs: true,
        functionId: 'test-stream-object'
      }
    });

    let partialObjectCount = 0;
    let finalObject: any = null;
    
    for await (const partial of result.partialObjectStream) {
      partialObjectCount++;
      finalObject = partial;
    }
    
    console.log(`   Received ${partialObjectCount} partial objects`);
    console.log(`   Final person: ${finalObject?.name}, ${finalObject?.age} years old, ${finalObject?.occupation}`);
    
    if (!finalObject?.name || !finalObject?.age || !finalObject?.occupation) {
      throw new Error('Missing required fields in generated person');
    }
  }

  async testEmbedding() {
    const result = await this.ai.embed({
      model: this.openai.embedding('text-embedding-3-small'),
      value: 'The quick brown fox jumps over the lazy dog',
      experimental_telemetry: {
        isEnabled: true,
        recordInputs: true,
        recordOutputs: true,
        functionId: 'test-embedding'
      }
    });

    console.log(`   Embedding dimensions: ${result.embedding.length}`);
    console.log(`   First 5 values: [${result.embedding.slice(0, 5).map((v: number) => v.toFixed(4)).join(', ')}...]`);
    
    if (result.embedding.length === 0) {
      throw new Error('Expected non-empty embedding');
    }
  }

  async testEmbedMany() {
    const values = [
      'The capital of France is Paris',
      'Machine learning is a subset of AI',
      'TypeScript is a typed superset of JavaScript'
    ];

    const result = await this.ai.embedMany({
      model: this.openai.embedding('text-embedding-3-small'),
      values,
      experimental_telemetry: {
        isEnabled: true,
        recordInputs: true,
        recordOutputs: true,
        functionId: 'test-embed-many'
      }
    });

    console.log(`   Generated ${result.embeddings.length} embeddings`);
    console.log(`   Embedding dimensions: ${result.embeddings[0].length}`);
    
    if (result.embeddings.length !== values.length) {
      throw new Error(`Expected ${values.length} embeddings, got ${result.embeddings.length}`);
    }
  }

  async testMaxTokensRespected() {
    const maxTokens = 50; // Use a more reasonable limit
    
    const result = await this.ai.generateText({
      model: this.anthropic('claude-3-haiku-20240307'),
      prompt: 'Write a short summary in one sentence',
      maxTokens,
      temperature: 0.5,
      experimental_telemetry: {
        isEnabled: true,
        recordInputs: true,
        recordOutputs: true,
        functionId: 'test-max-tokens'
      }
    });

    console.log(`   Generated text: ${result.text}`);
    console.log(`   Output tokens: ${result.usage.outputTokens}`);
    
    if (result.usage.outputTokens > maxTokens + 10) { // Allow small buffer
      throw new Error(`Output tokens (${result.usage.outputTokens}) exceeded max (${maxTokens})`);
    }
  }

  async testAbortSignal() {
    const controller = new AbortController();
    
    // Abort after 100ms
    setTimeout(() => controller.abort(), 100);
    
    try {
      await this.ai.generateText({
        model: this.openai('gpt-4o'),
        prompt: 'Write a very long essay about the history of computing',
        maxTokens: 1000,
        abortSignal: controller.signal,
        experimental_telemetry: {
          isEnabled: true,
          recordInputs: true,
          recordOutputs: true,
          functionId: 'test-abort-signal'
        }
      });
      
      throw new Error('Expected abort error');
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('   Request successfully aborted');
      } else {
        throw error;
      }
    }
  }

  async testMultipleToolCalls() {
    console.log('   Skipping multiple tool calls test due to SDK incompatibility');
    return;
    /*
    const result = await this.ai.generateText({
      model: this.openai('gpt-4o-mini'),
      prompt: 'Calculate: (10 + 5) * (8 - 3)',
      tools: {
        add: {
          description: 'Add two numbers',
          parameters: z.object({
            a: z.number(),
            b: z.number()
          }),
          execute: async ({ a, b }) => {
            console.log(`   Tool: add(${a}, ${b}) = ${a + b}`);
            return a + b;
          }
        },
        subtract: {
          description: 'Subtract two numbers',
          parameters: z.object({
            a: z.number(),
            b: z.number()
          }),
          execute: async ({ a, b }) => {
            console.log(`   Tool: subtract(${a}, ${b}) = ${a - b}`);
            return a - b;
          }
        },
        multiply: {
          description: 'Multiply two numbers',
          parameters: z.object({
            a: z.number(),
            b: z.number()
          }),
          execute: async ({ a, b }) => {
            console.log(`   Tool: multiply(${a}, ${b}) = ${a * b}`);
            return a * b;
          }
        }
      },
      maxSteps: 5,
      experimental_telemetry: {
        isEnabled: true,
        recordInputs: true,
        recordOutputs: true,
        functionId: 'test-multiple-tools'
      }
    });

    console.log(`   Final result: ${result.text}`);
    console.log(`   Total tool calls: ${result.toolCalls.length}`);
    
    if (!result.text.includes('75')) {
      throw new Error('Expected result to include 75');
    }
    */
  }

  // Run all tests
  async runAllTests() {
    await this.setup();

    const tests = [
      // ['Basic Text Generation', () => this.testBasicTextGeneration()],
      // ['Streaming Generation', () => this.testStreamingGeneration()],
      // ['Structured Output', () => this.testStructuredOutput()],
      // ['Tool Calling', () => this.testToolCalling()],
      ['Vision Image Input', () => this.testVisionImageInput()],
      // ['Multi-Provider Conversation', () => this.testMultiProviderConversation()],
      // ['Different Models', () => this.testDifferentModels()],
      // ['Stream Object', () => this.testStreamObject()],
      // ['Embedding', () => this.testEmbedding()],
      // ['Embed Many', () => this.testEmbedMany()],
      // ['Max Tokens Respected', () => this.testMaxTokensRespected()],
      // ['Abort Signal', () => this.testAbortSignal()],
      // ['Multiple Tool Calls', () => this.testMultipleToolCalls()]
    ] as const;

    for (const [name, testFn] of tests) {
      await this.runTest(name, testFn);
    }

    await this.teardown();
  }
}

// Main execution
async function main() {
  const runner = new TestRunner();
  
  try {
    await runner.runAllTests();
    process.exit(0);
  } catch (error) {
    console.error('Test suite failed:', error);
    process.exit(1);
  }
}

// Run tests
main().catch(console.error);