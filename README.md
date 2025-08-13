# Lucidic AI TypeScript SDK (Node)

Node.js SDK for Lucidic AI. It follows the LucidicAI Session → Step → Event model and bridges OpenTelemetry/OpenLLMetry spans into Lucidic session-level events. Supports providers (OpenAI, Anthropic, LangChain) and Vercel AI SDK.

- Non-global OTel provider (avoids conflicts)
- Exporter-first bridge (Batch or Simple span processor)
- Session/Step/Event APIs + decorators
- Decorators capture function metadata (function_name + JSON-safe arguments)
- Image uploads via presigned URLs
- Vercel AI SDK support (LLM spans + tool call spans)

## Requirements
- Node.js >= 18

## Install
```bash
npm install lucidicai
```

## Environment variables
- `LUCIDIC_API_KEY` (required)
- `LUCIDIC_AGENT_ID` (required)
- `LUCIDIC_AUTO_END` (optional) defaults to `True`; session auto-ends on shutdown

## Quick start

### A) Vercel AI SDK (recommended for router-based apps)
Use our built-in telemetry helper to route Vercel AI spans (LLM + tools) to Lucidic.

```ts
import 'dotenv/config';
import { init, aiTelemetry } from 'lucidicai';
import { generateText, tool } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

await init({
  sessionName: 'My Vercel AI Session',
  providers: [], // we don’t need provider auto-instrumentation for Vercel AI
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

- Lucidic will create events for:
  - LLM calls (ai.generateText.doGenerate spans)
  - Tool calls (ai.toolCall spans)
- Tool spans include arguments in the event description and the tool result in the event result.
- If the LLM finishes due to tool calls, the LLM event result lists all tool invocations.

### B) OpenAI/Anthropic using official SDKs (auto-instrumentation)
For vendor SDKs, initialize Lucidic and provide the module for manual instrumentation (ESM-safe). This ensures spans are captured without relying on import order.

```ts
import 'dotenv/config';
import { init } from 'lucidicai';
import OpenAI from 'openai';

await init({
  sessionName: 'OpenAI Session',
  providers: ['openai'],
  instrumentModules: { OpenAI }, // important for ESM order
});

const client = new OpenAI({ apiKey: process.env.OpenAI_API_KEY! });
const r = await client.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [
    { role: 'system', content: 'You are helpful.' },
    { role: 'user', content: 'Say hello' },
  ],
});
console.log(r.choices?.[0]?.message?.content);
```

ESM import order: static imports evaluate before code. If you don’t pass `instrumentModules`, ensure `init()` runs before importing the provider (e.g., dynamic `import('openai')` after `await init()`), or use our manual module patch path.

CommonJS: wrap in `async function main(){...}`; avoid top-level await.

## API

### init(params)
Starts a Lucidic session and wires telemetry.

Selected options:
- `sessionName?: string`
- `apiKey?: string` (defaults to `process.env.LUCIDIC_API_KEY`)
- `agentId?: string` (defaults to `process.env.LUCIDIC_AGENT_ID`)
- `providers?: Array<'openai'|'anthropic'|'langchain'>`
- `instrumentModules?: Record<string, any>` manual provider modules (ESM-friendly)
- `useSpanProcessor?: boolean` use SimpleSpanProcessor (immediate export). Default: BatchSpanProcessor with flush on exit
- `autoEnd?: boolean` default true, ends the session on `beforeExit`, `SIGINT`, `SIGTERM`
- `maskingFunction?: (text: string) => string` masking applied to descriptions/results in decorators and tool args/results in exporter

Example:
```ts
await init({ sessionName: 'Prod Session', providers: ['openai'] });
```

### Telemetry helpers (Vercel AI)
- `aiTelemetry()` returns `{ isEnabled: true, tracer: getLucidicTracer('ai'), recordInputs: true, recordOutputs: true }` for `experimental_telemetry`.
- `getLucidicTracer(name?: string)` returns a tracer from our local provider (fallback to global tracer).

### Session
```ts
import { updateSession, endSession } from 'lucidicai';

await updateSession({ task: 'indexing', tags: ['batch'] });
await endSession({ isSuccessful: true, isSuccessfulReason: 'Completed' });
```

### Steps
```ts
import { createStep, updateStep, endStep } from 'lucidicai';

const stepId = await createStep({ state: 'processing', screenshotPath: '/path/to/image.png' });
await updateStep({ stepId, evalScore: 0.9 });
await endStep({ stepId });
```
- `screenshotPath` auto-uploads via presigned URL.

### Events
```ts
import { createEvent, updateEvent, endEvent } from 'lucidicai';

const eventId = await createEvent({ description: 'Parsed request' });
await updateEvent({ eventId, result: 'ok' });
await endEvent({ eventId });
```
- For multimodal, pass base64 data URLs via `screenshots: string[]`.
- When events are created via decorators, the SDK also sends:
  - `function_name` (string): the decorated function name
  - `arguments` (JSON): the call arguments as a JSON-safe array in positional order
    - JSON-native values (string, number, boolean, null, arrays, plain objects) are preserved
    - Non-JSON values (e.g., functions, class instances, Dates, BigInt, NaN/Infinity, Maps/Sets, Buffers, typed arrays) are stringified
    - Strings are truncated to ~4096 chars and, if configured, masked by your `maskingFunction`
  - If you call the Event APIs directly, you may also pass these as `functionName` and `arguments` in the SDK; they will be sent to the backend as `function_name` and `arguments`.

### Decorators
Wrap functions to automatically create/end steps or events around them.

```ts
import { step, event } from 'lucidicai';

const doWork = step({ state: 'processing', action: 'compute' })(async (x: number) => {
  // LLM/tool calls inside still produce their own events
  return x * 2;
});

const parse = event({ description: 'Parse input' })(async (s: string) => JSON.parse(s));
```
Behavior:
- If SDK not initialized or no session, decorators no-op (run function normally)
- Step: creates a step, ends it on success; on error ends with `evalScore=0` and error message
- Event: description auto-generated from arguments if omitted; result auto-built from return value if omitted
- Masking function (if provided) is applied; long strings are safely truncated
- AsyncLocalStorage tracks current step/event IDs for helpers like `updateCurrentEvent`, `updateCurrentStep`

#### Function metadata in decorators
Decorated functions automatically include their name and arguments in the event payload sent to the backend.

```ts
import { event } from 'lucidicai';

// One positional argument (object)
const add = event()(async function add({ a, b }: { a: number; b: number }) {
  return a + b;
});

// Multiple positional arguments
const concat = event()(async function concat(a: string, b: string) {
  return a + b;
});
```

The backend receives fields:

```json
{
  "function_name": "add",
  "arguments": [ { "a": 2, "b": 3 } ]
}
```

Notes:
- `arguments` is an array matching the function call’s positional arguments.
- JSON-native types are preserved; non-JSON values are stringified.
- If a `maskingFunction` is provided to `init()`, it is applied to strings (including inside nested objects/arrays).

### Prompt API
```ts
import { PromptResource } from 'lucidicai';

const prompts = new PromptResource();
const rendered = await prompts.getPrompt('welcome', { name: 'Ada' });
const raw = await prompts.getRawPrompt('welcome');
```

## Vercel AI tools with decorators (class pattern)
```ts
import { init, aiTelemetry } from 'lucidicai';
import { event } from 'lucidicai';
import { generateText, tool } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

class Tools {
  @event({ description: 'add tool' })
  static async add({ a, b }: { a: number; b: number }) { return a + b; }

  @event({ description: 'reverse tool' })
  static async reverse({ text }: { text: string }) { return text.split('').reverse().join(''); }
}

await init({ sessionName: 'Agent Demo', providers: [] });
const telemetry = aiTelemetry();

const tools = {
  add: tool({ inputSchema: z.object({ a: z.number(), b: z.number() }), execute: Tools.add }),
  reverse: tool({ inputSchema: z.object({ text: z.string() }), execute: Tools.reverse }),
} as const;

const res = await generateText({ model: openai('gpt-4o-mini'), tools, prompt: 'Use tools', experimental_telemetry: telemetry });
console.log(res.text);
```

## Import patterns (ESM vs CJS)
- ESM: Static imports run before code. For provider auto-instrumentation (OpenAI/Anthropic), either pass `instrumentModules` to `init()` or import the provider dynamically after `await init()`.
- CJS: Wrap code in an async `main()` function; don’t use top-level await.

## Image handling
- Steps: `screenshotPath` (or `screenshot`) triggers presigned upload to S3
- Events: `screenshots: string[]` base64 data URLs are uploaded via presigned URLs
- Vercel AI: image content inside prompts is detected and uploaded instead of embedding base64 in event text

## Costs and models
- We compute cost from `gen_ai.usage.*` and model mapping, mirroring the Python SDK’s pricing logic

## Troubleshooting
- No events after init (OpenAI/Anthropic): ensure `instrumentModules` includes your provider module, or import the provider after `await init()`
- Vercel AI: always pass `experimental_telemetry: aiTelemetry()` so spans route to Lucidic
- Session didn’t auto-end: ensure process isn’t force-exited; we hook `beforeExit`, `SIGINT`, `SIGTERM` and flush the provider
- Top-level await errors: in CJS, wrap code in `async function main(){...}`

## License
MIT
