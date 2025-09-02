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

type EventOptions = { tags?: string[]; metadata?: Record<string, any>; misc?: Record<string, any> };

/**
 * Universal decorator factory compatible with TS 5 (standard) method decorators
 * and higher-order function wrapping for standalone functions.
 *
 * Usage:
 *  - Class methods (TS5):
 *      class X { @event({}) method() {} }
 *  - Standalone functions:
 *      const fn = event({})(function fn(...) { ... })
 */
export function event(options: EventOptions = {}) {
  function wrapFunction<F extends AnyFn>(fn: F, explicitName?: string): F {
    const wrapper = function(this: any, ...args: any[]) {
      if (!getSessionId()) {
        debug('No active session, running function without event decorator');
        return fn.apply(this, args) as ReturnType<F>;
      }

      const mask = getMask();
      const functionName = explicitName || fn.name || 'anonymous';
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

      return als.run(newContext, () => {
        const startTime = Date.now();
        try {
          const result = fn.apply(this, args);
          if (result && typeof (result as any).then === 'function') {
            // Async path: attach handlers
            return (result as Promise<any>)
              .then(res => {
                let serializedReturn = toJsonSafe(res);
                if (mask) serializedReturn = mapJsonStrings(serializedReturn, mask);
                const duration = (Date.now() - startTime) / 1000;
                void import('./event.js').then(({ createEvent }) => {
                  createEvent({ ...params, return_value: serializedReturn, duration });
                });
                return res;
              })
              .catch(error => {
                const duration = (Date.now() - startTime) / 1000;
                const errorReturnValue = {
                  error: String(error),
                  error_type: error instanceof Error ? error.constructor.name : 'Error'
                };
                void import('./event.js').then(({ createEvent }) => {
                  createEvent({
                    ...params,
                    return_value: errorReturnValue,
                    duration,
                    error: String(error),
                    metadata: { ...(options.metadata || {}), error: true, error_message: String(error) }
                  });
                });
                throw error;
              });
          } else {
            // Sync path: create event immediately (async import, fire-and-forget)
            let serializedReturn = toJsonSafe(result);
            if (mask) serializedReturn = mapJsonStrings(serializedReturn, mask);
            const duration = (Date.now() - startTime) / 1000;
            void import('./event.js').then(({ createEvent }) => {
              createEvent({ ...params, return_value: serializedReturn, duration });
            });
            return result;
          }
        } catch (error: any) {
          const duration = (Date.now() - startTime) / 1000;
          const errorReturnValue = {
            error: String(error),
            error_type: error instanceof Error ? error.constructor.name : 'Error'
          };
          void import('./event.js').then(({ createEvent }) => {
            createEvent({
              ...params,
              return_value: errorReturnValue,
              duration,
              error: String(error),
              metadata: { ...(options.metadata || {}), error: true, error_message: String(error) }
            });
          });
          throw error;
        }
      }) as ReturnType<F>;
    } as AnyFn;
    return wrapper as F;
  }

  // Returned function can act as:
  // 1) TS5 method decorator: (value, context) => newValue
  // 2) Higher-order function: (fn) => wrappedFn
  return function(...args: any[]): any {
    // TS5 method decorator path
    if (args.length === 2 && typeof args[0] === 'function' && args[1] && typeof args[1] === 'object' && 'kind' in args[1]) {
      const value = args[0] as AnyFn;
      const context = args[1] as { kind: string; name?: string | symbol };
      if (context.kind === 'method' || context.kind === 'getter' || context.kind === 'setter') {
        const name = typeof context.name === 'symbol' ? (context.name.description || 'anonymous') : String(context.name ?? value.name);
        return wrapFunction(value, name);
      }
      // For unsupported kinds, return original value unchanged
      return value;
    }

    // Higher-order function path for standalone functions
    if (args.length === 1 && typeof args[0] === 'function') {
      return wrapFunction(args[0] as AnyFn);
    }

    // Fallback - return input
    return args[0];
  };
}

// Optional helpers use ALS context

export function getDecoratorContext() { return als.getStore(); }

export async function withParentEvent<T>(parentEventId: string, fn: () => Promise<T>): Promise<T> {
  const parent = als.getStore();
  const ctx: DecoratorContext = { currentEventId: parentEventId, eventStack: [...(parent?.eventStack || []), parentEventId] };
  return als.run(ctx, fn);
}

