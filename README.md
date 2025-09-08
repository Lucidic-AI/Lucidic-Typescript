# Lucidic AI TypeScript SDK (Node)

Node.js SDK for Lucidic AI. It provides comprehensive observability for AI applications through a flexible Session → Event model, bridging OpenTelemetry spans into Lucidic's analytics platform. Supports major LLM providers (OpenAI, Anthropic, Vertex AI, Bedrock) and the Vercel AI SDK.

- **Typed Event System**: Flexible event creation with automatic type detection
- **Non-blocking Event Queue**: Asynchronous event batching with dependency resolution
- **Async-Safe Context Management**: AsyncLocalStorage (ALS) for correct session routing in concurrent environments
- **Auto-Instrumentation**: OpenTelemetry-based automatic capture of LLM calls
- **Decorator Support**: TypeScript 5 decorators capture function metadata automatically
- **Cost Tracking**: Automatic cost calculation for 170+ models
- **Blob Storage**: Automatic handling of large payloads via S3
- **Crash Resilience**: Captures uncaught exceptions as events before exit

## Requirements
- Node.js >= 18

## Install
```bash
npm install lucidicai
```

## Environment variables
- `LUCIDIC_API_KEY` (required)
- `LUCIDIC_AGENT_ID` (required)
- `LUCIDIC_AUTO_END` (optional) defaults to `true`; session auto-ends on shutdown
- `LUCIDIC_SILENT_MODE` (optional) defaults to `true`; SDK errors are handled internally

## Quick start

### A) Vercel AI SDK (recommended for AI applications)
Use our built-in telemetry helper to route Vercel AI spans (LLM + tools) to Lucidic.

```ts
import 'dotenv/config';
import { init, aiTelemetry } from 'lucidicai';
import { generateText, tool } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

await init({
  sessionName: 'My Vercel AI Session',
  providers: [], // Vercel AI SDK doesn't need provider auto-instrumentation
});

const telemetry = aiTelemetry();

const tools = {
  add: tool({
    inputSchema: z.object({ a: z.number(), b: z.number() }),
    execute: async ({ a, b }) => a + b,
  }),
} as const;

const res = await generateText({
  model: openai('gpt-4o-mini'),
  prompt: 'Use the add tool to compute 2+3',
  tools,
  experimental_telemetry: telemetry,
});

console.log(res.text);
```

Events created automatically:
- **LLM calls**: `llm_generation` events with prompts, completions, tokens, cost
- **Tool calls**: `function_call` events with arguments and results

### B) OpenAI/Anthropic using official SDKs (auto-instrumentation)
For vendor SDKs, pass the module to `instrumentModules` for ESM-safe instrumentation.

```ts
import 'dotenv/config';
import { init } from 'lucidicai';
import OpenAI from 'openai';

await init({
  sessionName: 'OpenAI Session',
  instrumentModules: { OpenAI }, // ESM-safe instrumentation
});

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const r = await client.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [
    { role: 'system', content: 'You are helpful.' },
    { role: 'user', content: 'Say hello' },
  ],
});
console.log(r.choices?.[0]?.message?.content);
```

**ESM Note**: Static imports evaluate before code. Either pass `instrumentModules` or import the provider dynamically after `await init()`.

## Event System

The SDK provides a flexible event system with automatic type detection and structured payloads.

### Event Types
- `llm_generation`: LLM API calls with model, messages, tokens, cost
- `function_call`: Function/tool invocations with arguments and results  
- `error_traceback`: Errors with stack traces
- `generic`: General events with custom data

### Creating Events

```ts
import { createEvent } from 'lucidicai';

// Simple description
createEvent('Processing user request');

// Typed event with details
createEvent('function_call', 'Calculating result');

// Full control with structured data
createEvent({
  type: 'llm_generation',
  provider: 'openai',
  model: 'gpt-4o-mini',
  messages: [{ role: 'user', content: 'Hello' }],
  output: 'Hi there!',
  input_tokens: 10,
  output_tokens: 5,
  cost: 0.0001,
});

// Error tracking
createEvent({
  type: 'error_traceback',
  error: new Error('Something went wrong'),
});

// Parent-child relationships
const parentId = createEvent('Parent operation');
createEvent({
  type: 'function_call',
  function_name: 'childOperation',
  parentEventId: parentId,
});
```

### Event Helpers

```ts
import { createLLMEvent, createFunctionEvent, createErrorEvent } from 'lucidicai';

// LLM event helper
createLLMEvent(
  'openai',
  'gpt-4o-mini',
  [{ role: 'user', content: 'Hello' }],
  'Hi there!',
  { input_tokens: 10, output_tokens: 5, cost: 0.0001 }
);

// Function event helper
createFunctionEvent('calculateSum', [1, 2, 3], 6);

// Error event helper
createErrorEvent(new Error('API request failed'));
```

## Session Management

### Async-Safe Context (for concurrent requests)

The SDK uses AsyncLocalStorage to ensure correct session routing in concurrent environments.

#### Option 1: Full context manager (auto-end)
```ts
import { withLucidic } from 'lucidicai';

const result = await withLucidic({
  sessionName: 'order-123',
  providers: ['openai'],
}, async () => {
  // All LLM calls and events route to this session
  return await processOrder();
});
// Session automatically ended
```

#### Option 2: Manual session with context wrapper
```ts
import { init, withSession, endSession } from 'lucidicai';

const sessionId = await init({ 
  sessionName: 'persistent-session',
  autoEnd: false 
});

// First request
await withSession(sessionId, async () => {
  // Events route to this session
  await handleRequest1();
});

// Second request (same session)
await withSession(sessionId, async () => {
  // Events still route to same session
  await handleRequest2();
});

// Manually end when done
await endSession({ isSuccessful: true });
```

#### Option 3: Fully manual context
```ts
import { init, setActiveSession, clearActiveSession, endSession } from 'lucidicai';

const sessionId = await init({ sessionName: 'manual' });
setActiveSession(sessionId);
await doWork();
clearActiveSession();
await endSession({ isSuccessful: true });
```

### Backend Patterns

#### Per-request sessions
```ts
app.post('/api/chat', async (req, res) => {
  const sessionId = await init({ 
    sessionName: `chat-${req.id}`,
    autoEnd: false,
    providers: ['openai'],
  });
  
  await withSession(sessionId, async () => {
    // Handle request with session context
    const response = await processChat(req.body);
    res.json(response);
  });
  
  // End session after response sent
  await endSession({ isSuccessful: true });
});
```

#### Background jobs
```ts
// In job processor
async function processJob(jobId: string, sessionId: string) {
  setActiveSession(sessionId);
  try {
    await runJobLogic(jobId);
  } finally {
    clearActiveSession();
  }
}
```

## Decorators

Automatically track function execution with the `@event` decorator (TypeScript 5+).

```ts
import { event } from 'lucidicai';

class DataProcessor {
  @event({ tags: ['api', 'external'] })
  async fetchData(url: string): Promise<any> {
    const response = await fetch(url);
    return response.json();
  }

  @event({ metadata: { version: '1.0' } })
  processResults(data: any[]): number {
    return data.reduce((sum, item) => sum + item.value, 0);
  }
}
```

For standalone functions:
```ts
const processPayment = event({ tags: ['payment'] })(
  async function processPayment(amount: number, currency: string) {
    // Function implementation
    return { success: true, transactionId: '123' };
  }
);
```

**Decorator Features**:
- Captures function name and arguments automatically
- Measures execution duration
- Handles both sync and async functions
- Creates parent-child relationships for nested calls
- Applies masking function if configured
- Captures errors with type information

## API Reference

### init
Starts a Lucidic session and configures telemetry.

```ts
await init({
  sessionName?: string,
  apiKey?: string,              // defaults to LUCIDIC_API_KEY
  agentId?: string,             // defaults to LUCIDIC_AGENT_ID
  providers?: Array<'openai'|'anthropic'|'langchain'|'vertexai'|'bedrock'|'cohere'>,
  instrumentModules?: Record<string, any>,  // ESM manual instrumentation
  autoEnd?: boolean,            // default true
  captureUncaught?: boolean,    // default true, capture uncaught exceptions
  maskingFunction?: (text: string) => string,
  tags?: string[],
  experimentId?: string,
});
```

Returns: `Promise<string>` - The session ID

### Event Creation

```ts
// Flexible event creation
createEvent(params: FlexibleEventParams): string | undefined

// Event helpers
createLLMEvent(provider, model, messages, response, usage?, parentEventId?): string | undefined
createFunctionEvent(functionName, args?, returnValue?, parentEventId?): string | undefined
createErrorEvent(error, parentEventId?): string | undefined
createGenericEvent(details?, misc?, parentEventId?): string | undefined

// Flush events
await flush();       // Process queued events
await forceFlush();  // Ensure all events sent
```

### Session Management

```ts
// Update session properties
await updateSession({
  task?: string,
  tags?: string[],
  isSuccessful?: boolean,
  isSuccessfulReason?: string,
});

// End session
await endSession({
  isSuccessful?: boolean,
  isSuccessfulReason?: string,
});

// Context management
withSession<T>(sessionId: string, fn: () => T): T
setActiveSession(sessionId: string): void
clearActiveSession(): void
```

### Telemetry Helpers

```ts
// Get Vercel AI SDK telemetry config
aiTelemetry(): {
  isEnabled: true,
  tracer: Tracer,
  recordInputs: true,
  recordOutputs: true,
}

// Get OpenTelemetry tracer
getLucidicTracer(name?: string, version?: string): Tracer
```

### Prompt Management

```ts
// Fetch and substitute variables
await getPrompt({
  promptName: string,
  variables?: Record<string, any>,
  cacheTtl?: number,  // seconds; -1 for forever, 0 to disable
  label?: string,      // default 'production'
}): Promise<string>

// Fetch raw prompt without substitution
await getRawPrompt({
  promptName: string,
  cacheTtl?: number,
  label?: string,
}): Promise<string>
```

### Experiments

```ts
// Create an experiment
await createExperiment({
  experimentName: string,
  passFailRubrics: string[],  // required, at least one
  scoreRubrics?: string[],
  description?: string,
  tags?: string[],
  apiKey?: string,
  agentId?: string,
}): Promise<string>  // Returns experiment ID
```

## Advanced Features

### Error Boundary & Recovery (v2.2.0+)

The SDK includes a comprehensive error boundary system that prevents SDK errors from crashing your application while maintaining stateless recovery capabilities.

#### Configuration

Error handling is controlled by the `LUCIDIC_SILENT_MODE` environment variable:

- `LUCIDIC_SILENT_MODE=true` (default): SDK errors are caught and handled internally
- `LUCIDIC_SILENT_MODE=false`: SDK errors propagate normally to your application

```bash
# Enable silent mode (default)
export LUCIDIC_SILENT_MODE=true
npm start

# Disable for debugging
export LUCIDIC_SILENT_MODE=false
npm start
```

#### How It Works

When silent mode is enabled (default), the SDK employs a stateless error boundary that:

1. **Catches all SDK errors**: Prevents SDK failures from affecting your application
2. **Returns safe fallback values**: Operations return appropriate defaults based on context
3. **Performs context-aware cleanup**: Only cleans up resources related to the failed operation
4. **Allows immediate recovery**: Each operation gets a fresh chance to succeed

##### Stateless Recovery

Unlike traditional error handling that might "poison" the SDK state, the error boundary maintains stateless recovery:

```typescript
// First attempt - fails due to invalid credentials
const experiment1 = await createExperiment({
  experimentName: 'Test 1',
  apiKey: 'invalid-key',
  agentId: 'invalid-agent',
});
// Returns: 'fallback-experiment-[timestamp]'

// Second attempt - succeeds with valid credentials
const experiment2 = await createExperiment({
  experimentName: 'Test 2',
  apiKey: process.env.LUCIDIC_API_KEY,
  agentId: process.env.LUCIDIC_AGENT_ID,
});
// Returns: actual experiment ID from server

// Both attempts are independent - first failure doesn't affect second
```

##### Context-Aware Cleanup

The error boundary intelligently determines what cleanup is needed based on the operation type:

- **Session operations**: Emergency session ending with event flushing
- **Data fetch operations**: No cleanup needed, returns fallback data
- **Telemetry operations**: Silent failure, no user impact
- **Utility operations**: Returns safe defaults

##### Error Logging

Errors are logged concisely without stack traces cluttering your console:

```
[Lucidic][WARN] SDK Error in experiment.createExperiment (data_fetch): Error - 403 {"detail":"Invalid API key"}
```

Full error details including stack traces are preserved in the error history for debugging.

#### Fallback Values

When errors occur, operations return predictable fallback values:

| Operation Type | Fallback Value |
|---------------|----------------|
| `init()` | `'fallback-session-[timestamp]'` |
| `createExperiment()` | `'fallback-experiment-[timestamp]'` |
| `createEvent()` | `undefined` |
| `getDataset()` | `{ items: [], dataset_id: '', name: '', num_items: 0 }` |
| `getFeatureFlag()` | `{ flag_name: '', flag_value: null }` |
| `getPrompt()` | `'[Prompt unavailable]'` |
| Session operations | `undefined` or `void` |

#### Debugging & Monitoring

```typescript
import { isInSilentMode, getErrorHistory, getEndedSessionCount, resetErrorBoundary } from 'lucidicai';

// Check current mode
console.log('Silent mode:', isInSilentMode());

// Get error history (only available in silent mode)
const errors = getErrorHistory();
errors.forEach(err => {
  console.log(`${err.timestamp} - ${err.moduleName}.${err.functionName} failed:`, err.error);
});

// Check emergency-ended sessions
console.log('Emergency-ended sessions:', getEndedSessionCount());

// Reset error boundary state (for testing)
resetErrorBoundary();
```

#### Error History

The SDK maintains a rolling history of the last 50 errors for debugging:

```typescript
interface ErrorContext {
  functionName: string;
  moduleName: string;
  args: any[];
  error: any;
  timestamp: Date;
}

const errorHistory = getErrorHistory();
// Returns array of ErrorContext objects
```

#### Migration from Earlier Versions

Version 2.2.0+ enables silent mode by default. Your application will continue to work without changes, but SDK errors will no longer crash your application.

To maintain previous behavior where SDK errors propagate:

```bash
export LUCIDIC_SILENT_MODE=false
```

#### Best Practices

1. **Production**: Keep silent mode enabled (default) for maximum stability
2. **Development**: Consider disabling for easier debugging of SDK integration issues
3. **Testing**: Test with both modes to ensure proper error handling
4. **Recovery**: Design your application to handle fallback values gracefully
5. **Monitoring**: Periodically check error history in production to identify issues

#### Examples

See `examples/error-recovery-showcase.ts` and `examples/error-recovery-showcase-simple.ts` for comprehensive demonstrations of the error boundary and recovery capabilities.

### Event Queue Configuration

Configure the event queue behavior via environment variables:

- `LUCIDIC_MAX_QUEUE_SIZE`: Maximum queued events (default: 100,000)
- `LUCIDIC_FLUSH_INTERVAL`: Flush timer in ms (default: 100)
- `LUCIDIC_FLUSH_AT`: Event count trigger (default: 100)
- `LUCIDIC_BLOB_THRESHOLD`: Blob storage threshold in bytes (default: 65,536)

Large payloads exceeding the blob threshold are automatically uploaded to S3 with gzip compression.

### Parallel Event Processing (v2.3.0+)

The SDK processes events in parallel for optimal performance:

- **Parallel Batching**: Multiple events are sent concurrently using `Promise.allSettled()`
- **Configurable Concurrency**: Control the number of events processed in parallel
- **Automatic Retry**: Failed events are retried up to 3 times before being dropped
- **Independent Events**: Events are processed without dependency constraints

Configuration via environment variables:
- `LUCIDIC_BATCH_SIZE`: Number of events to process in parallel per batch (default: 20)
- `LUCIDIC_MAX_CONCURRENCY`: Maximum concurrent requests (default: 10)

Example:
```bash
# Process up to 50 events in parallel
export LUCIDIC_BATCH_SIZE=50
export LUCIDIC_MAX_CONCURRENCY=25
npm start
```

Performance improvements:
- 10-20x faster event flushing compared to sequential processing
- Reduced application shutdown time
- Better utilization of available network bandwidth
- Lower latency for event delivery to backend

### Custom Masking

Protect sensitive data with a custom masking function:

```ts
await init({
  sessionName: 'Secure Session',
  maskingFunction: (text: string) => {
    // Mask credit card numbers
    return text.replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, 'XXXX-XXXX-XXXX-XXXX');
  },
});
```

The masking function is applied to:
- Decorator function arguments and return values
- Event descriptions and details
- Error messages and stack traces

### Crash Event Handling

The SDK automatically captures uncaught exceptions and creates crash events before the process exits.

```ts
await init({
  captureUncaught: true,  // default
});

// If an uncaught exception occurs:
// 1. A crash event is created with the stack trace
// 2. The session is ended
// 3. Telemetry is flushed
// 4. Process exits with code 1
```

To opt out:
```ts
await init({ captureUncaught: false });
```

### Telemetry Export Modes

Control span processing behavior:

```ts
// Batch processing (default, better for production)
await init({ useSpanProcessor: false });

// Simple processing (immediate export, better for debugging)
await init({ useSpanProcessor: true });

// Or via environment variable
LUCIDIC_EXPORT_MODE=simple npm start
```

## Troubleshooting

### No events appearing
- Verify `LUCIDIC_API_KEY` and `LUCIDIC_AGENT_ID` are set
- Check session initialization succeeded
- Enable debug logging: `LUCIDIC_DEBUG=true`
- For provider instrumentation, ensure `instrumentModules` is configured

### Events routing to wrong session
- Use `withSession()` for concurrent request handling
- Verify AsyncLocalStorage context propagation
- Check that you're not mixing global and context-based sessions

### Provider not instrumenting (ESM)
```ts
// Option 1: Pass module to instrumentModules
import OpenAI from 'openai';
await init({ instrumentModules: { OpenAI } });

// Option 2: Dynamic import after init
await init({ providers: ['openai'] });
const { default: OpenAI } = await import('openai');
```

### Large payload handling
Events larger than 64KB are automatically uploaded to blob storage. If uploads fail:
- Check network connectivity
- Verify S3 permissions are configured correctly
- Monitor `LUCIDIC_DEBUG=true` logs for upload errors

### Memory considerations
- Event queue has a maximum size (default 100,000 events)
- Failed events retry up to 3 times before being dropped
- Sent event IDs are tracked to resolve dependencies

## Cost Tracking

The SDK automatically calculates costs for 170+ models across all major providers:

- OpenAI (GPT-4o, GPT-3.5, o1 series)
- Anthropic (Claude 3.5, Claude 3, Claude 2)
- Google (Gemini 2.5, Gemini 1.5, PaLM)
- Meta (Llama 4, Llama 3.x)
- And many more...

Costs are calculated from token usage and included in LLM events automatically.

## Import Patterns

### ESM
```ts
// Static imports require instrumentModules
import { init } from 'lucidicai';
import OpenAI from 'openai';
await init({ instrumentModules: { OpenAI } });
```

### CommonJS
```js
// Wrap in async function
async function main() {
  const { init } = require('lucidicai');
  await init({ sessionName: 'CJS Session' });
  // Your code here
}
main();
```

## Examples

Check the `examples/` directory for complete working examples:
- `vercel_ai.ts`: Vercel AI SDK with tools
- `openai.ts`: OpenAI direct usage
- `anthropic.ts`: Anthropic Claude integration  
- `decorators_agent.ts`: Class-based agent with decorators
- `nested-decorators.ts`: Parent-child event relationships

## License
MIT