// Minimal client patchers to intercept images in OpenAI/Anthropic requests
import { AsyncLocalStorage } from 'async_hooks';

const store = new AsyncLocalStorage<{ images: string[]; texts: string[] }>();

export function runWithStore<T>(fn: () => T) {
  return store.run({ images: [], texts: [] }, fn);
}

export function getStoredImages(): string[] {
  return store.getStore()?.images ?? [];
}

export function addImage(dataUrl: string) {
  const s = store.getStore();
  if (s && typeof dataUrl === 'string' && dataUrl.startsWith('data:image')) s.images.push(dataUrl);
}

export function addText(text: string) {
  const s = store.getStore();
  if (s && typeof text === 'string') s.texts.push(text);
}

export function patchOpenAIClient(client: any) {
  const chat = client?.chat?.completions;
  if (!chat || !chat.create) return client;
  const original = chat.create.bind(chat);
  chat.create = async (...args: any[]) => {
    const opts = args[0] ?? {};
    const messages = opts.messages;
    tryExtractOpenAIMessages(messages);
    return original(...args);
  };
  return client;
}

export function patchAnthropicClient(client: any) {
  const messages = client?.messages;
  if (!messages || !messages.create) return client;
  const original = messages.create.bind(messages);
  messages.create = async (...args: any[]) => {
    const opts = args[0] ?? {};
    tryExtractAnthropicMessages(opts?.messages);
    return original(...args);
  };
  return client;
}

function tryExtractOpenAIMessages(messages: any) {
  if (!Array.isArray(messages)) return;
  messages.forEach((m: any, idx: number) => {
    const content = m?.content;
    if (Array.isArray(content)) {
      const texts: string[] = [];
      for (const item of content) {
        if (item?.type === 'text' && item.text) texts.push(item.text);
        if (item?.type === 'image_url' && item.image_url?.url && String(item.image_url.url).startsWith('data:image')) addImage(item.image_url.url);
      }
      if (texts.length) addText(texts.join(' '));
    }
  });
}

function tryExtractAnthropicMessages(messages: any) {
  if (!Array.isArray(messages)) return;
  messages.forEach((m: any) => {
    const content = m?.content;
    if (Array.isArray(content)) {
      for (const item of content) {
        if (item?.type === 'image') {
          const src = item.source;
          if (src?.type === 'base64' && src.data) {
            const mime = src.media_type ?? 'image/jpeg';
            addImage(`data:${mime};base64,${src.data}`);
          }
        }
        if (item?.type === 'text' && item.text) addText(item.text);
      }
    }
  });
}

