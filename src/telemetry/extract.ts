import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { debug } from '../util/logger';

export function detectIsLlmSpan(span: ReadableSpan): boolean {
  const name = (span.name || '').toLowerCase();
  if (['openai','anthropic','chat','completion','embedding','llm'].some(k => name.includes(k))) return true;
  const attrs = span.attributes ?? {};
  return Object.keys(attrs).some(k => typeof k === 'string' && (k.startsWith('gen_ai.') || k.startsWith('llm.')));
}

export function extractPrompts(attrs: Record<string, any>): string | null {
  const indexed: string[] = [];
  for (let i = 0; i < 50; i++) {
    const role = attrs[`gen_ai.prompt.${i}.role`];
    const rawContent = attrs[`gen_ai.prompt.${i}.content`];
    const content = typeof rawContent === 'string' ? safeJsonParse(rawContent) ?? rawContent : rawContent;
    if (!role && !content) break;
    const text = formatPromptContent(content);
    indexed.push(`${role ?? 'user'}: ${text ?? ''}`);
  }
  if (indexed.length) return indexed.join('\n');
  const list = attrs['gen_ai.prompt'];
  if (Array.isArray(list)) {
    const out = list.map((m: any) => formatMessage(m)).filter(Boolean);
    if (out.length) return out.join('\n');
  }
  debug('No explicit prompts found in attributes');
  return null;
}

export function extractCompletions(span: ReadableSpan, attrs: Record<string, any>): string | null {
  const indexed: string[] = [];
  for (let i = 0; i < 50; i++) {
    const content = attrs[`gen_ai.completion.${i}.content`];
    if (!content) break;
    indexed.push(typeof content === 'string' ? content : tryJson(content));
  }
  if (indexed.length) return indexed.join('\n');
  const comp = attrs['gen_ai.completion'];
  if (Array.isArray(comp)) return comp.map(x => (typeof x === 'string' ? x : tryJson(x))).join('\n');
  if (typeof comp === 'string') return comp;
  debug('No explicit completions found in attributes');
  return null;
}

export function extractImages(attrs: Record<string, any>): string[] {
  const out: string[] = [];
  // scan indexed prompt content arrays for image_url items
  for (let i = 0; i < 50; i++) {
    const raw = attrs[`gen_ai.prompt.${i}.content`];
    const content = typeof raw === 'string' ? safeJsonParse(raw) ?? raw : raw;
    const images = collectImagesFromContent(content);
    out.push(...images);
  }
  const list = attrs['gen_ai.prompt'];
  if (Array.isArray(list)) {
    for (const m of list) out.push(...collectImagesFromContent(m?.content));
  }
  return out;
}

export function extractModel(attrs: Record<string, any>): string | null {
  return attrs['gen_ai.response.model'] || attrs['gen_ai.request.model'] || null;
}

function collectImagesFromContent(content: any): string[] {
  const out: string[] = [];
  const arr = Array.isArray(content) ? content : [];
  for (const item of arr) {
    if (item && typeof item === 'object') {
      // OpenAI shape
      if (item.type === 'image_url') {
        const url = item.image_url?.url;
        if (typeof url === 'string' && url.startsWith('data:image')) out.push(url);
      }
      // Anthropic shape
      if (item.type === 'image' && item.source && typeof item.source === 'object') {
        const mediaType = item.source.media_type || 'image/jpeg';
        const data = item.source.data;
        if (typeof data === 'string' && data.length > 0) out.push(`data:${mediaType};base64,${data}`);
      }
    }
  }
  return out;
}

function formatMessage(m: any): string | null {
  if (!m || typeof m !== 'object') return null;
  const role = m.role ?? 'user';
  const content = m.content;
  if (typeof content === 'string') return `${role}: ${content}`;
  if (Array.isArray(content)) {
    const texts = content.filter((c: any) => c?.type === 'text').map((c: any) => c.text).filter(Boolean);
    return texts.length ? `${role}: ${texts.join(' ')}` : null;
  }
  return null;
}

function tryJson(v: any): string {
  try { return JSON.stringify(v); } catch { return String(v); }
}

function safeJsonParse(v: string): any | null {
  try { return JSON.parse(v); } catch { return null; }
}

// Convert Polyglot content (string | array | object) into text-only representation
function formatPromptContent(content: any): string | null {
  if (typeof content === 'string') {
    const parsed = safeJsonParse(content);
    if (Array.isArray(parsed)) {
      const texts = parsed.filter((c: any) => c?.type === 'text').map((c: any) => c.text).filter(Boolean);
      return texts.length ? texts.join(' ') : '';
    }
    return content;
  }
  if (Array.isArray(content)) {
    const texts = content.filter((c: any) => c?.type === 'text').map((c: any) => c.text).filter(Boolean);
    return texts.length ? texts.join(' ') : null;
  }
  return tryJson(content);
}

