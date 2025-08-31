import { AsyncLocalStorage } from 'node:async_hooks';
import { debug } from '../util/logger';
import { getMask, getSessionId } from './init';
import { toJsonSafe, mapJsonStrings } from '../util/serialization';
import { FlexibleEventParams } from '../client/types';
import * as crypto from 'crypto';

type AnyFn = (...args: any[]) => any;

export type DecoratorContext = { currentEventId?: string; eventStack: string[] };
const als = new AsyncLocalStorage<DecoratorContext>();

export function getDecoratorEvent(): string | undefined {
  return als.getStore()?.currentEventId;
}

export function event(options: { tags?: string[]; metadata?: Record<string, any>; misc?: Record<string, any> } = {}) {
  return function <F extends AnyFn>(fn: F): F {
    const wrapper = async function(this: any, ...args: any[]) {
      if (!getSessionId()) {
        debug('No active session, running function without event decorator');
        return await fn.apply(this, args);
      }

      const { createEvent } = await import('./event.js');
      const mask = getMask();

      const functionName = fn.name || 'anonymous';
      let serializedArgs = toJsonSafe(args);
      if (mask) serializedArgs = mapJsonStrings(serializedArgs, mask);

      const parentContext = als.getStore();
      const parentEventId = parentContext?.currentEventId;

      const clientEventId = crypto.randomUUID();
      
      const params: FlexibleEventParams = {
        eventId: clientEventId,
        type: 'function_call',
        function_name: functionName,
        arguments: serializedArgs,
        parentEventId,
        tags: options.tags,
        metadata: options.metadata,
        ...(options.misc || {}),
      };

      const newContext: DecoratorContext = {
        currentEventId: clientEventId,
        eventStack: [...(parentContext?.eventStack || []), clientEventId],
      };

      return await als.run(newContext, async () => {
        const startTime = Date.now();
        try {
          const result = await fn.apply(this, args);
          let serializedReturn = toJsonSafe(result);
          if (mask) serializedReturn = mapJsonStrings(serializedReturn, mask);
          const duration = (Date.now() - startTime) / 1000;
          createEvent({ ...params, return_value: serializedReturn, duration });
          return result;
        } catch (error) {
          const duration = (Date.now() - startTime) / 1000;
          // Store error as structured return value with error type (matching Python SDK)
          const errorReturnValue = {
            error: String(error),
            error_type: error instanceof Error ? error.constructor.name : 'Error'
          };
          createEvent({ 
            ...params, 
            return_value: errorReturnValue, 
            duration, 
            error: String(error),
            metadata: { ...(options.metadata || {}), error: true, error_message: String(error) } 
          });
          // Note: Python SDK doesn't create separate error_traceback events anymore
          // Keeping for backward compatibility but could be removed
          throw error;
        }
      });
    } as AnyFn;
    return wrapper as F;
  };
}

// Optional helpers use ALS context

export function getDecoratorContext() { return als.getStore(); }

export async function withParentEvent<T>(parentEventId: string, fn: () => Promise<T>): Promise<T> {
  const parent = als.getStore();
  const ctx: DecoratorContext = { currentEventId: parentEventId, eventStack: [...(parent?.eventStack || []), parentEventId] };
  return als.run(ctx, fn);
}

