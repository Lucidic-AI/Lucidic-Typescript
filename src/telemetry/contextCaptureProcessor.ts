/**
 * Context Capture Processor for OpenTelemetry spans.
 * 
 * This processor captures Lucidic context (session_id, parent_event_id) at span creation time
 * and stores it in span attributes. This ensures context is preserved even when spans are
 * processed asynchronously in different contexts.
 * 
 * This fixes the nesting issue for ALL providers (OpenAI, Anthropic, etc.)
 */

import type { SpanProcessor, ReadableSpan, Span } from '@opentelemetry/sdk-trace-base';
import type { Context } from '@opentelemetry/api';
import { getActiveSessionFromAls } from './sessionContext';
import { getDecoratorContext } from '../sdk/decorators';
import { getSessionId } from '../sdk/init';
import { debug } from '../util/logger';

export class ContextCaptureProcessor implements SpanProcessor {
  /**
   * Called when a span is started - capture context here synchronously
   */
  onStart(span: Span, _parentContext: Context): void {
    try {
      // Capture session ID from ALS context first, then fall back to global
      const alsStore = getActiveSessionFromAls();
      const sessionId = alsStore.sessionId || getSessionId();
      
      if (sessionId) {
        span.setAttribute('lucidic.session_id', sessionId);
      }

      // Capture parent event ID from decorator context
      const decoratorContext = getDecoratorContext();
      const parentEventId = decoratorContext?.currentEventId;
      
      if (parentEventId) {
        span.setAttribute('lucidic.parent_event_id', parentEventId);
        debug(`[ContextCapture] Captured parent_event_id ${parentEventId.substring(0, 8)}... for span ${span.name}`);
      }

      debug('ContextCaptureProcessor.onStart', { 
        name: span.name, 
        sessionId, 
        parentEventId: parentEventId?.substring(0, 8) 
      });
    } catch (error) {
      // Never fail span creation due to context capture
      debug('[ContextCapture] Failed to capture context:', error);
    }
  }

  /**
   * Called when a span ends - no action needed
   */
  onEnd(_span: ReadableSpan): void {
    // No-op
  }

  /**
   * Shutdown the processor
   */
  async shutdown(): Promise<void> {
    return Promise.resolve();
  }

  /**
   * Force flush - no buffering in this processor
   */
  async forceFlush(): Promise<void> {
    return Promise.resolve();
  }
}