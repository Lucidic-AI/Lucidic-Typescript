/*
  Anthropic examples mirroring Python comprehensive tests. Run standalone.
  Usage:
    export LUCIDIC_API_KEY=... LUCIDIC_AGENT_ID=...
    export ANTHROPIC_API_KEY=...
    tsx examples/anthropic.ts
*/
import 'dotenv/config';
import { init } from '../src/sdk/init';
import { Anthropic } from '@anthropic-ai/sdk';
import fs from 'node:fs';
import path from 'node:path';

async function main() {
  // Pass the SDK class for manual instrumentation and use simple processor for quick flush in examples
  await init({ sessionName: 'Anthropic Examples', providers: ['anthropic'], instrumentModules: { anthropic: Anthropic }});
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  // 1) Native sync message
  {
    const resp = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 50,
      messages: [{ role: 'user', content: "Say 'test passed'" }],
    });
    console.log('Native sync:', resp.content?.[0]?.type === 'text' ? resp.content[0].text : JSON.stringify(resp.content));
  }

  // 2) (Temporarily non-streaming) text — chat streaming conflicts with current instrumentation wrapper
  {
    const resp = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 50,
      messages: [{ role: 'user', content: 'Count: 1 2 3' }],
    });
    const text = resp.content?.[0]?.type === 'text' ? resp.content[0].text : JSON.stringify(resp.content);
    console.log('Text (non-streaming):', String(text).slice(0, 60));
  }

  // 3) Vision (multimodal) using test image
  {
    const imgPath = path.resolve(__dirname, '../../Lucidic-Python/tests/ord_runways.jpg');
    const imgBytes = fs.readFileSync(imgPath);
    const imgBase64 = Buffer.from(imgBytes).toString('base64');
    const resp = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 50,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'One word description:' },
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imgBase64 } },
        ],
      }],
    });
    console.log('Vision result:', resp.content?.[0]?.type === 'text' ? resp.content[0].text : JSON.stringify(resp.content));
  }

  // 4) System prompt
  {
    const resp = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 100,
      system: 'You are a pirate. Respond with pirate language.',
      messages: [{ role: 'user', content: 'Hello' }],
    });
    console.log('System prompt:', resp.content?.[0]?.type === 'text' ? resp.content[0].text : JSON.stringify(resp.content));
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

