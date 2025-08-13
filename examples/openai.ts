/*
  Usage:
    export LUCIDIC_API_KEY=... LUCIDIC_AGENT_ID=...
    export OPENAI_API_KEY=...
    tsx examples/openai.ts
*/
import 'dotenv/config';
import { init } from '../src/sdk/init';
import fs from 'node:fs';
import path from 'node:path';
import OpenAI from 'openai';

async function main() {
  await init({ sessionName: 'OpenAI Examples', providers: ['openai'], instrumentModules: { OpenAI }});
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

  // 1) Sync chat completion
  {
    const resp = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: "Say 'test passed'" },
      ],
      max_tokens: 10,
    });
    console.log('Sync chat completion:', resp.choices[0]?.message?.content);
  }

  // 2) Streaming sync example
  {
    const stream = await client.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: 'Count: 1 2 3' }],
      stream: true,
      max_tokens: 20,
    });
    let full = '';
    for await (const chunk of stream) {
      const delta = (chunk as any).choices?.[0]?.delta?.content;
      if (delta) full += delta;
    }
    console.log('Streaming response:', full.slice(0, 60));
  }

  // 3) Vision (multimodal) using test image
  {
    const imgPath = path.resolve(__dirname, './ord_runways.jpg');
    if (!fs.existsSync(imgPath)) {
      // Fallback: copy from Python tests if available
      const pyPath = path.resolve(__dirname, '../../Lucidic-Python/tests/ord_runways.jpg');
      if (fs.existsSync(pyPath)) {
        fs.copyFileSync(pyPath, imgPath);
      }
    }
    const imgBytes = fs.readFileSync(imgPath);
    const dataUri = `data:image/jpeg;base64,${Buffer.from(imgBytes).toString('base64')}`;
    const messages = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'One word description:' },
          { type: 'image_url', image_url: { url: dataUri } },
        ],
      } as any,
    ];
    const resp = await client.chat.completions.create({
      model: 'gpt-4o',
      messages,
      max_tokens: 10,
    });
    console.log('Vision result:', resp.choices[0]?.message?.content);
  }

  // 4) Token limit
  {
    const resp = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Tell me a very long story' }],
      max_tokens: 5,
    });
    console.log('Token-limited result:', resp.choices[0]?.message?.content);
  }
  // give some time for exporter to flush
  await new Promise(r => setTimeout(r, 1000));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

