import type { SpanProcessor, ReadableSpan } from '@opentelemetry/sdk-trace-base';
import type { Context } from '@opentelemetry/api';
import { getActiveSessionFromAls } from './sessionContext';
import { debug } from '../util/logger';

export class SessionStampProcessor implements SpanProcessor {
  onStart(span: any, _ctx: Context) {
    const { sessionId } = getActiveSessionFromAls();
    if (sessionId) span.setAttribute('lucidic.session_id', sessionId);
    debug('SessionStampProcessor.onStart', { name: span.name, sessionId });
  }
  onEnd(_span: ReadableSpan): void {}
  shutdown(): Promise<void> { return Promise.resolve(); }
  forceFlush(): Promise<void> { return Promise.resolve(); }
}
