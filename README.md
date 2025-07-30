# Lucidic AI TypeScript SDK

Official TypeScript SDK for Lucidic AI - LLM observability platform for tracking and analyzing AI agent workflows.

## Installation

```bash
npm install lucidicai
```

## Quick Start

```typescript
import * as lai from 'lucidicai';

// Initialize the SDK
await lai.init({
  apiKey: 'your-api-key', // or set LUCIDIC_API_KEY env var
  agentId: 'your-agent-id', // or set LUCIDIC_AGENT_ID env var
  sessionName: 'My AI Assistant',
  providers: ['openai', 'anthropic'] // Auto-instrument providers
});

// IMPORTANT: Import LLM libraries AFTER lai.init() for automatic tracking
const OpenAI = (await import('openai')).default;
const openai = new OpenAI();

// Your LLM calls are now automatically tracked!
const response = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello!' }]
});

// End session when done
await lai.endSession();
```

## Core Concepts

### Sessions
Top-level containers for complete AI workflows:

```typescript
// Initialize a session
await lai.initSession({
  sessionName: 'Customer Support Chat',
  task: 'Help user with product questions',
  userId: 'user123',
  groupId: 'support-team'
});

// Continue an existing session
await lai.continueSession('existing-session-id');

// Update session
await lai.updateSession('New task description', { custom: 'tags' });

// End session
await lai.endSession(true, 'Successfully resolved issue');
```

### Steps
Logical units within sessions that track state, action, and goal:

```typescript
// Create a step with named parameters (all optional)
const step = await lai.createStep({
  state: 'Analyzing user query',
  action: 'Parse intent and extract entities',
  goal: 'Understand user needs'
});

// Create step with parameters in any order
await lai.createStep({
  goal: 'Complete analysis',
  state: 'Processing',
  action: 'Analyze data'
});

// Create step with no parameters
await lai.createStep();

// End step with named parameters
await lai.endStep({
  evalScore: 95,
  evalDescription: 'Successfully identified intent'
});

// End step with no parameters
await lai.endStep();

// End specific step by ID
await lai.endStep({
  stepId: 'step-123',
  evalScore: 100,
  state: 'Completed'
});
```

### Events
Individual LLM API calls (automatically tracked when providers are instrumented):

```typescript
// Create event with named parameters (all optional)
const event = await lai.createEvent({
  description: 'Custom LLM call',
  result: 'Model response here',
  model: 'gpt-4',
  costAdded: 0.03
});

// Create event with parameters in any order
await lai.createEvent({
  model: 'claude-3',
  description: 'Another call',
  result: 'Response'
});

// Create event with no parameters
await lai.createEvent();

// Update event with named parameters
await lai.updateEvent({
  eventId: event.eventId,
  result: 'Updated result',
  description: 'Updated description'
});

// Update with parameters in any order
await lai.updateEvent({
  model: 'gpt-4-turbo',
  eventId: event.eventId,
  costAdded: 0.05,
  result: 'New result'
});
```

## Features

### Optional Named Parameters

All SDK functions support optional named parameters that can be passed in any order, similar to the Python SDK:

```typescript
// All parameters are optional
await lai.createStep();
await lai.createEvent();
await lai.endStep();

// Pass only what you need, in any order
await lai.createStep({ goal: 'My goal' });
await lai.endStep({ evalScore: 90 });
await lai.createEvent({ model: 'gpt-4', description: 'Test' });

// Mix and match parameters as needed
await lai.updateEvent({
  eventId: 'event-123',
  result: 'Updated'
});
```

### Automatic Provider Instrumentation

The SDK automatically instruments supported providers using OpenTelemetry:

```typescript
lai.init({
  providers: ['openai', 'anthropic']
});

// All OpenAI and Anthropic calls are now tracked automatically
```

### Auto-Creation and Auto-End Features

The SDK provides several automatic features to reduce boilerplate code:

#### Auto Step Creation
When creating an event without an active step, the SDK automatically creates a temporary step:

```typescript
// No active step exists
const event = await lai.createEvent({
  description: 'My event',
  result: 'Event result'
});
// A temporary step is created and immediately finished
```

#### Auto Event Creation
LLM API calls are automatically tracked as events when providers are instrumented:

```typescript
// After initializing with providers
await lai.init({ providers: ['openai'] });

// This OpenAI call automatically creates an event
const response = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello!' }]
});
```

#### Auto Step End with Decorators
Use decorators to automatically end steps when functions complete:

```typescript
import { step } from 'lucidicai';

class MyService {
  @step({
    state: 'Processing data',
    action: 'Transform input',
    goal: 'Generate output'
  })
  async processData(input: string): Promise<string> {
    // Step is created when method starts
    const result = await someProcessing(input);
    return result;
    // Step is automatically ended when method completes
  }
}
```

Or use the functional wrapper:

```typescript
import { withStep } from 'lucidicai';

const wrappedFunction = withStep(async (data: string) => {
  return await processData(data);
}, {
  state: 'Processing',
  action: 'Transform data',
  goal: 'Return result'
});

// Step is automatically created and ended
await wrappedFunction('my data');
```

#### Auto Session End on Exit
By default, the SDK automatically ends active sessions when your program exits:

```typescript
// Sessions are auto-ended on:
// - Normal process exit
// - SIGINT (Ctrl+C)
// - SIGTERM
// - Uncaught exceptions
// - Unhandled promise rejections

// To disable auto-end:
await lai.init({
  autoEnd: false  // or set LUCIDIC_AUTO_END=false env var
});
```

When a session ends, all unfinished steps are automatically ended as well.

### Multimodal Support

Handles text and image inputs automatically:

```typescript
const response = await openai.chat.completions.create({
  model: 'gpt-4-vision-preview',
  messages: [{
    role: 'user',
    content: [
      { type: 'text', text: 'What is in this image?' },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,...' } }
    ]
  }]
});
```

### Cost Tracking

Built-in pricing data for all major models:

```typescript
// Costs are automatically calculated based on token usage
const event = await lai.createEvent({
  description: 'GPT-4 call',
  model: 'gpt-4',
  // costAdded calculated automatically from token usage
});
```

### Data Masking

Protect sensitive information:

```typescript
lai.setMaskingFunction((text: string) => {
  // Mask SSNs, emails, etc.
  return text.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '***-**-****');
});
```

### Mass Simulations

Run large-scale testing:

```typescript
await lai.runMassSimulation({
  sessionBaseName: 'Load Test',
  numSessions: 100,
  sessionFunction: async () => {
    // Your test logic here
    await someAIOperation();
  }
});
```

### Prompt Management

Fetch and cache prompts from the platform:

```typescript
const prompt = await lai.getPrompt('customer-support-prompt');
```

### Image Upload

Upload images for analysis:

```typescript
const imageUrl = await lai.uploadImage(imageBuffer);
```

## Configuration

### Environment Variables

- `LUCIDIC_API_KEY` - Your Lucidic API key
- `LUCIDIC_AGENT_ID` - Your Lucidic agent ID
- `LUCIDIC_DEBUG` - Set to 'True' for debug logging
- `LUCIDIC_AUTO_END` - Set to 'false' to disable auto-end on exit (default: 'true')

### Initialization Options

```typescript
interface LucidicConfig {
  apiKey?: string;         // API key (defaults to LUCIDIC_API_KEY env var)
  agentId?: string;       // Agent ID (defaults to LUCIDIC_AGENT_ID env var)
  sessionName?: string;    // Auto-create session with this name
  sessionId?: string;      // Continue existing session
  task?: string;          // Session task description
  userId?: string;        // User identifier
  groupId?: string;       // Group identifier
  testId?: string;        // Test run identifier
  providers?: string[];   // Providers to auto-instrument
  maskingFunction?: (text: string) => string; // Data masking
  autoEnd?: boolean;      // Auto-end session on exit (defaults to true)
}
```

## Supported Providers

- OpenAI (including GPT-4, GPT-3.5, o1, o3 models)
- Anthropic (Claude 3/3.5/4 models)

### Known Limitations

#### Anthropic Streaming Content
Due to a limitation in the `@traceloop/instrumentation-anthropic` library, streaming responses from Anthropic's messages API are not fully captured. When using `stream: true` with `anthropic.messages.create()`, the response content will show as "Response received" instead of the actual streamed content.

**Workaround**: For critical use cases where you need streaming content tracked, you can manually create events:

```typescript
// Manual tracking for Anthropic streaming
const stream = await anthropic.messages.create({
  model: 'claude-3-haiku-20240307',
  messages: [{ role: 'user', content: 'Hello' }],
  stream: true
});

let fullContent = '';
for await (const event of stream) {
  if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
    fullContent += event.delta.text;
  }
}

// Manually create an event with the content
await lai.createEvent({
  description: 'Anthropic streaming response',
  result: fullContent,
  model: 'claude-3-haiku-20240307'
});
```

## Error Handling

The SDK provides specific error types:

```typescript
try {
  await lai.init({ apiKey: 'invalid' });
} catch (error) {
  if (error instanceof lai.ConfigurationError) {
    // Handle configuration errors
  } else if (error instanceof lai.APIError) {
    // Handle API errors
  }
}
```

## TypeScript Support

Full TypeScript support with comprehensive type definitions:

```typescript
import { Session, Step, Event, LucidicConfig } from 'lucidicai';
```

## Important: Import Order

**Critical**: For automatic LLM call tracking to work, you must initialize Lucidic AI **before** importing any LLM provider libraries (OpenAI, Anthropic, etc.).

### Correct Order
```typescript
// 1. First, initialize Lucidic
await lai.init({ providers: ['openai'] });

// 2. Then, import LLM libraries
const OpenAI = (await import('openai')).default;
```

### Incorrect Order
```typescript
// DON'T DO THIS - events won't be tracked!
import OpenAI from 'openai';  // Imported before lai.init()
await lai.init({ providers: ['openai'] });
```

## Examples

### Basic Chat Application

```typescript
import * as lai from 'lucidicai';

// Initialize Lucidic first
await lai.init({
  sessionName: 'Chat Session',
  providers: ['openai']
});

// Then import OpenAI
const OpenAI = (await import('openai')).default;
const openai = new OpenAI();

// Create a step for the conversation
await lai.createStep({
  state: 'Active conversation',
  action: 'Respond to user messages',
  goal: 'Provide helpful responses'
});

// Have a conversation (automatically tracked)
const response = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'How do I use TypeScript?' }
  ]
});

console.log(response.choices[0].message.content);

// End the session
await lai.endStep(100, 'Conversation completed');
await lai.endSession(true);
```

### Multi-Step Workflow

```typescript
// Step 1: Analyze input
await lai.createStep({
  state: 'Input analysis',
  action: 'Extract intent and entities',
  goal: 'Understand user request'
});

// ... perform analysis ...

await lai.endStep(100, 'Analysis complete');

// Step 2: Process request
await lai.createStep({
  state: 'Processing',
  action: 'Generate response',
  goal: 'Create helpful output'
});

// ... generate response ...

await lai.endStep(100, 'Response generated');
```

## License

MIT