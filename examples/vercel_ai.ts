/*
  Example: Vercel AI SDK integration with Lucidic

  Usage:
    export LUCIDIC_API_KEY=...
    export LUCIDIC_AGENT_ID=...
    export OPENAI_API_KEY=...
    pnpm tsx examples/vercel_ai.ts
*/
import 'dotenv/config';
import { init } from '../src/sdk/init';
import { aiTelemetry } from '../src/sdk/init';
import fs from 'node:fs';
import path from 'node:path';
import { generateText, streamText, tool } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

async function main() {
  // Init Lucidic (non-global provider). We'll pass our tracer per-call.
  await init({ sessionName: 'Vercel AI SDK Demo', providers: [] });

  async function regularChat() {
  const res = await generateText({
    model: openai('gpt-4o-mini'),
    prompt: 'Say "hello from vercel ai"',
    experimental_telemetry: aiTelemetry(),
  });
  console.log('Chat:', res.text);
}

  async function streamingChat() {
  const { textStream } = await streamText({
    model: openai('gpt-4o-mini'),
    prompt: 'Count to 5:',
    experimental_telemetry: aiTelemetry(),
  });
  let full = '';
  for await (const chunk of textStream) full += chunk;
  console.log('Stream:', full);
}

  async function visionImage() {
    // Use a real image buffer to satisfy AI SDK validation
    let imageBuffer: Buffer;
    const candidate = path.resolve(__dirname, '../../Lucidic-Python/tests/ord_runways.jpg');
    if (fs.existsSync(candidate)) {
      imageBuffer = fs.readFileSync(candidate);
    } else {
      // 1x1 transparent PNG
      const onePxPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==';
      imageBuffer = Buffer.from(onePxPngBase64, 'base64');
    }
    const res = await generateText({
      model: openai('gpt-4o'),
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'One word description:' },
            { type: 'image', image: imageBuffer } as any,
          ],
        },
      ],
      experimental_telemetry: aiTelemetry(),
    });
    console.log('Vision:', res.text);
  }

  async function toolCalls() {
    // Define tool using AI SDK helper + zod schema
    const tools = {
      add: tool({
        description: 'Add two numbers',
        inputSchema: z.object({ a: z.number(), b: z.number() }),
        execute: async ({ a, b }: { a: number; b: number }) => a + b,
      }),
    } as const;

  const res = await generateText({
    model: openai('gpt-4o-mini'),
    system: 'You can use tools when needed.',
    prompt: 'What is 2+3? Use the add tool.',
    tools,
    experimental_telemetry: aiTelemetry(),
  });
  console.log('Tool result:', res.text);
}
  await regularChat();
  await streamingChat();
  await visionImage();
  await toolCalls();

  // Small delay to allow batch exporter flush
  await new Promise(r => setTimeout(r, 1000));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});


