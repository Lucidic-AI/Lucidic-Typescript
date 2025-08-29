import { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base';
import { SpanStatusCode } from '@opentelemetry/api';

import { extractPrompts, extractCompletions, extractImages, detectIsLlmSpan, extractModel } from './extract.js';
import { getSessionId } from '../sdk/init.js';
import { createEvent } from '../sdk/event.js';
import { getDecoratorContext } from '../sdk/decorators.js';
import { debug } from '../util/logger.js';

export class LucidicSpanExporter implements SpanExporter {
  constructor(private cfg: { baseUrl?: string; apiKey: string; agentId: string }) {}

  async export(spans: ReadableSpan[], resultCallback: (result: any) => void): Promise<void> {
    try {
      const decoratorContext = getDecoratorContext();
      for (const span of spans) {
        const attrs = span.attributes ?? {};
        const isAiSdkToolSpan = span.name === 'ai.toolCall';
        const isLlmSpan = detectIsLlmSpan(span);
        if (!isLlmSpan && !isAiSdkToolSpan) continue;

        debug('Exporter processing span', { name: span.name, attrs });
        const stampedSessionId = attrs['lucidic.session_id'] as string | undefined;
        const sessionId = stampedSessionId ?? getSessionId();
        debug('Span routing decision', { name: span.name, used: stampedSessionId ? 'stamped' : 'global', sessionId });
        if (!sessionId) continue;

        if (isAiSdkToolSpan) {
          const toolName = attrs['ai.toolCall.name'] as string | undefined;
          const rawArgs = attrs['ai.toolCall.args'] as string | undefined;
          const toolResult = attrs['ai.toolCall.result'] as string | undefined;
          let parsedArgs: any;
          try { parsedArgs = rawArgs ? JSON.parse(rawArgs) : undefined; } catch { parsedArgs = rawArgs; }
          createEvent({ type: 'function_call', function_name: toolName || 'unknown_tool', arguments: parsedArgs, return_value: toolResult, parentEventId: decoratorContext?.currentEventId });
        } else {
          const prompts = extractPrompts(attrs);
          const completions = extractCompletions(span, attrs) ?? (span.status.code === SpanStatusCode.ERROR ? `Error: ${span.status.message ?? 'Unknown error'}` : 'Response received');
          const images = extractImages(attrs);
          const model = extractModel(attrs) ?? 'unknown';
          const inputTokens = (attrs['gen_ai.usage.prompt_tokens'] as number) || (attrs['llm.usage.prompt_tokens'] as number) || 0;
          const outputTokens = (attrs['gen_ai.usage.completion_tokens'] as number) || (attrs['llm.usage.completion_tokens'] as number) || 0;
          const provider = this.detectProvider(model, attrs);
          const messages = this.parseMessagesFromPrompts(prompts ?? '');
          createEvent({ type: 'llm_generation', provider, model, messages, output: completions || '', input_tokens: inputTokens, output_tokens: outputTokens, parentEventId: decoratorContext?.currentEventId, span_name: span.name, span_duration: span.endTime && span.startTime ? (span.endTime[0] - span.startTime[0]) + (span.endTime[1] - span.startTime[1]) / 1e9 : undefined });
          if (images.length > 0) { debug(`LLM span has ${images.length} images - handle separately if needed`); }
        }
      }
      resultCallback({ code: 0 });
    } catch (e) {
      debug('Exporter error', e);
      resultCallback({ code: 1, error: e as any });
    }
  }

  private detectProvider(model: string, attrs: Record<string, any>): string {
    if (attrs['gen_ai.system']) return String(attrs['gen_ai.system']).toLowerCase();
    const m = (model || '').toLowerCase();
    if (m.includes('gpt') || m.includes('davinci')) return 'openai';
    if (m.includes('claude')) return 'anthropic';
    if (m.includes('gemini') || m.includes('palm')) return 'google';
    if (m.includes('llama') || m.includes('mixtral') || m.includes('mistral')) return 'meta';
    return 'unknown';
  }

  private parseMessagesFromPrompts(prompts: string): any[] {
    if (!prompts) return [];
    try {
      const parsed = JSON.parse(prompts);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
    return [{ role: 'user', content: prompts }];
  }

  async shutdown(): Promise<void> {}
}

