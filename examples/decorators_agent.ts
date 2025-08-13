/*
  Example: Simple agent loop with Vercel AI SDK + Lucidic decorators

  Usage:
    export LUCIDIC_API_KEY=... LUCIDIC_AGENT_ID=... OPENAI_API_KEY=...
    pnpm add -D ai @ai-sdk/openai zod
    npx tsx examples/decorators_agent.ts
*/
import 'dotenv/config';
import { init, aiTelemetry } from '../src/sdk/init';
import { event } from '../src/sdk/decorators';
import { generateText, tool } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

// Plain tool functions (top-level)
export async function addTool({ a, b }: { a: number; b: number }): Promise<number> {
  return a + b;
}
export async function subtractTool({ a, b }: { a: number; b: number }): Promise<number> {
  return a - b;
}
export async function timeTool(): Promise<string> {
  return new Date().toISOString();
}
export async function reverseTool({ text }: { text: string }): Promise<string> {
  return text.split('').reverse().join('');
}

// Class with decorated tool methods
class Tools {
  @event({ description: 'add tool' })
  static async add({ a, b }: { a: number; b: number }) { return addTool({ a, b }); }

  @event({ description: 'subtract tool' })
  static async subtract({ a, b }: { a: number; b: number }) { return subtractTool({ a, b }); }

  @event({ description: 'time tool' })
  static async now() { return timeTool(); }

  @event({ description: 'reverse tool' })
  static async reverse({ text }: { text: string }) { return reverseTool({ text }); }
}

// Vercel AI tool registry using class methods
export const tools = {
  add: tool({ inputSchema: z.object({ a: z.number(), b: z.number() }), execute: Tools.add }),
  subtract: tool({ inputSchema: z.object({ a: z.number(), b: z.number() }), execute: Tools.subtract }),
  now: tool({ inputSchema: z.object({}), execute: Tools.now as any }),
  reverse: tool({ inputSchema: z.object({ text: z.string() }), execute: Tools.reverse }),
} as const;

async function main() {
  await init({ sessionName: 'Decorator Agent Demo', providers: [] });

  const tasks = [
    'Use the add tool to compute 7 + 12, then say the current time using the now tool.',
    'Reverse the text "Lucidic" using the reverse tool, then subtract 3 from 15 using subtract tool.',
    'Compute 123 + 456 and then 99 - 12 using tools; finally respond with a short summary.',
  ];

  for (const prompt of tasks) {
    const res = await generateText({
      model: openai('gpt-4o-mini'),
      tools,
      prompt,
      experimental_telemetry: aiTelemetry(),
    });
    console.log('\nAssistant:', res.text);
  }

  await new Promise(r => setTimeout(r, 1000));
}

main().catch(err => { console.error(err); process.exit(1); });


