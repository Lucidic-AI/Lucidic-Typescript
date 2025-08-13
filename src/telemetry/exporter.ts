import { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base';
import { SpanStatusCode } from '@opentelemetry/api';

import { extractPrompts, extractCompletions, extractImages, detectIsLlmSpan, extractModel } from './extract.js';
import { getHttp, getSessionId, getAgentId } from '../sdk/init.js';
import { EventResource } from '../client/resources/event.js';
import { calculateCostUSD } from './pricing.js';
import { debug } from '../util/logger.js';

export class LucidicSpanExporter implements SpanExporter {
  constructor(private cfg: { baseUrl?: string; apiKey: string; agentId: string }) {}

  async export(spans: ReadableSpan[], resultCallback: (result: any) => void): Promise<void> {
    try {
      const http = getHttp();
      const sessionId = getSessionId();
      if (!sessionId) { resultCallback({ code: 0 }); return; }
      const eventRes = new EventResource(http);
      const agentId = getAgentId();

      for (const span of spans) {
        const attrs = span.attributes ?? {};
        const isAiSdkToolSpan = span.name === 'ai.toolCall';
        const isLlmSpan = detectIsLlmSpan(span);
        if (!isLlmSpan && !isAiSdkToolSpan) continue;

        debug('Exporter processing span', { name: span.name, attrs });
        let description: string;
        let result: string | null;
        let images: string[] = [];
        let model: string = 'unknown';
        let cost: number | null = null;

        if (isAiSdkToolSpan) {
          const toolName = attrs['ai.toolCall.name'] as string | undefined;
          description = `Tool call: ${toolName ?? 'unknown'}`;
          result = (attrs['ai.toolCall.result'] as string | undefined) ?? null;
          images = [];
          model = 'tool';
          cost = null;
        } else {
          description = extractPrompts(attrs) ?? `LLM Call: ${span.name}`;
          result = extractCompletions(span, attrs) ?? (span.status.code === SpanStatusCode.ERROR ? `Error: ${span.status.message ?? 'Unknown error'}` : 'Response received');
          images = extractImages(attrs);
          model = extractModel(attrs) ?? 'unknown';
          cost = calculateCostUSD(model, attrs);
        }

        const isSuccessful = span.status.code !== SpanStatusCode.ERROR;
        const duration = span.endTime && span.startTime ? (span.endTime[0] - span.startTime[0]) + (span.endTime[1] - span.startTime[1]) / 1e9 : undefined;

        debug('Exporter built event payload', { description, resultPreview: String(result).slice(0, 80), model, imagesCount: images.length, isSuccessful, duration, cost });
        await eventRes.initEvent({
          description,
          result: result ?? undefined,
          model,
          costAdded: cost ?? undefined,
          screenshots: images.length ? images : undefined,
          sessionId,
          agentId,
        });
      }
      resultCallback({ code: 0 });
    } catch (e) {
      debug('Exporter error', e);
      resultCallback({ code: 1, error: e as any });
    }
  }

  async shutdown(): Promise<void> {}
}

