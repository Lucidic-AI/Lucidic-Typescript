import { EventType } from '../client/types';
import { EventResource } from '../client/resources/event';
import { debug, error as logError } from '../util/logger';
import { gzip } from 'zlib';
import { promisify } from 'util';

const gzipAsync = promisify(gzip);

interface QueuedEvent {
  clientEventId: string;
  parentClientEventId?: string;
  sessionId: string;
  type: EventType;
  occurredAt: string;
  duration?: number;
  tags?: string[];
  metadata?: Record<string, any>;
  payload: any;
  timestamp: number;
  retries: number;
}

export class EventQueue {
  private queue: QueuedEvent[] = [];
  private processing = false;
  private flushTimer: NodeJS.Timeout | null = null;
  private shutdownPromise: Promise<void> | null = null;

  private readonly maxQueueSize = Number(process.env.LUCIDIC_MAX_QUEUE_SIZE) || 100_000;
  private readonly flushIntervalMs = Number(process.env.LUCIDIC_FLUSH_INTERVAL) || 100;
  private readonly flushAtCount = Number(process.env.LUCIDIC_FLUSH_AT) || 100;
  private readonly blobThreshold = Number(process.env.LUCIDIC_BLOB_THRESHOLD) || 64 * 1024;

  private sentEventIds = new Set<string>();
  private eventResource: EventResource;

  constructor(eventResource: EventResource) {
    this.eventResource = eventResource;
  }

  queueEvent(params: QueuedEvent): string {
    if (this.queue.length >= this.maxQueueSize) {
      logError(`Event queue at max size ${this.maxQueueSize}, dropping event`);
      return '';
    }
    this.queue.push(params);
    debug(`Queued event ${params.clientEventId}, queue size: ${this.queue.length}`);
    if (this.queue.length >= this.flushAtCount) {
      void this.processQueue();
    } else {
      this.scheduleFlush();
    }
    return params.clientEventId;
  }

  private scheduleFlush() {
    if (!this.flushTimer && this.queue.length > 0) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null;
        void this.processQueue();
      }, this.flushIntervalMs);
      if ((this.flushTimer as any).unref) {
        (this.flushTimer as any).unref();
      }
    }
  }

  private async processQueue() {
    if (this.processing) return;
    this.processing = true;
    try {
      while (this.queue.length > 0) {
        const nextIndex = this.queue.findIndex(e => !e.parentClientEventId || this.sentEventIds.has(e.parentClientEventId));
        if (nextIndex === -1) {
          debug('All queued events waiting for parents, will retry later');
          break;
        }
        const event = this.queue.splice(nextIndex, 1)[0];
        await this.sendEvent(event);
      }
    } finally {
      this.processing = false;
      if (this.queue.length > 0) this.scheduleFlush();
    }
  }

  private async sendEvent(event: QueuedEvent) {
    try {
      const payloadStr = JSON.stringify(event.payload, null, 0);
      const payloadSize = Buffer.byteLength(payloadStr, 'utf-8');
      let finalPayload = event.payload;
      let needsBlob = false;
      if (payloadSize > this.blobThreshold) {
        needsBlob = true;
        finalPayload = this.generatePreview(event.type, event.payload);
        debug(`Event ${event.clientEventId} needs blob storage (${payloadSize} bytes)`);
      }
      const resp = await this.eventResource.createEvent({
        client_event_id: event.clientEventId,
        parent_client_event_id: event.parentClientEventId,
        session_id: event.sessionId,
        type: event.type,
        occurred_at: event.occurredAt,
        duration: event.duration,
        tags: event.tags,
        metadata: event.metadata,
        payload: finalPayload,
        needs_blob: needsBlob,
      });
      if (needsBlob && resp?.blob_url) {
        await this.uploadBlob(resp.blob_url, event.payload);
        debug(`Blob uploaded for event ${event.clientEventId}`);
      }
      this.sentEventIds.add(event.clientEventId);
      debug(`Event ${event.clientEventId} sent successfully`);
    } catch (err) {
      logError(`Failed to send event ${event.clientEventId}:`, err);
      event.retries++;
      if (event.retries < 3) {
        this.queue.push(event);
        debug(`Re-queued event ${event.clientEventId} for retry ${event.retries}`);
      }
    }
  }

  private generatePreview(type: EventType, payload: any): any {
    switch (type) {
      case 'llm_generation': {
        const req = payload.request || {};
        const usage = payload.usage || {};
        return {
          request: {
            model: req.model ? String(req.model).slice(0, 200) : undefined,
            provider: req.provider ? String(req.provider).slice(0, 200) : undefined,
          },
          usage: {
            input_tokens: usage.input_tokens,
            output_tokens: usage.output_tokens,
            cost: usage.cost,
          },
        };
      }
      case 'function_call':
        return { function_name: payload.function_name ? String(payload.function_name).slice(0, 200) : undefined };
      case 'error_traceback':
        return { error: payload.error ? String(payload.error).slice(0, 200) : undefined };
      case 'generic':
      default:
        return { details: payload.details ? String(payload.details).slice(0, 200) : undefined };
    }
  }

  private async uploadBlob(blobUrl: string, payload: any) {
    const jsonStr = JSON.stringify(payload, null, 0);
    const compressed = await gzipAsync(Buffer.from(jsonStr, 'utf-8'));
    // Node fetch BodyInit does not accept Buffer in types; use Uint8Array view
    const body = new Uint8Array(compressed);
    const response = await fetch(blobUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' },
      body,
    });
    if (!response.ok) throw new Error(`Blob upload failed: ${response.status} ${response.statusText}`);
  }

  async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    while (this.queue.length > 0) {
      await this.processQueue();
      if (this.queue.length > 0) {
        const orphans = this.queue.splice(0, this.queue.length);
        for (const ev of orphans) { await this.sendEvent(ev); }
      }
    }
  }

  async forceFlush(): Promise<void> {
    if (this.shutdownPromise) return this.shutdownPromise;
    this.shutdownPromise = this.flush().finally(() => { this.shutdownPromise = null; });
    return this.shutdownPromise;
  }
}


