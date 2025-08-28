import { AsyncLocalStorage } from 'node:async_hooks';
import { debug } from '../util/logger';
import { getMask, getSessionId } from './init';
import { toJsonSafe, mapJsonStrings } from '../util/serialization';

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

      const { createEvent, updateEvent } = await import('./event.js');
      const { createErrorEvent } = await import('./event-helpers.js');
      const mask = getMask();

      const functionName = fn.name || 'anonymous';
      let serializedArgs = toJsonSafe(args);
      if (mask) serializedArgs = mapJsonStrings(serializedArgs, mask);

      const parentContext = als.getStore();
      const parentEventId = parentContext?.currentEventId;

      const eventId = await createEvent({
        type: 'function_call',
        parentEventId,
        payload: {
          function_name: functionName,
          arguments: serializedArgs,
          misc: options.misc,
        },
        tags: options.tags,
        metadata: options.metadata,
      } as any);

      if (!eventId) {
        return await fn.apply(this, args);
      }

      const newContext: DecoratorContext = {
        currentEventId: eventId,
        eventStack: [...(parentContext?.eventStack || []), eventId],
      };

      return await als.run(newContext, async () => {
        const startTime = Date.now();
        try {
          const result = await fn.apply(this, args);
          let serializedReturn = toJsonSafe(result);
          if (mask) serializedReturn = mapJsonStrings(serializedReturn, mask);
          const duration = (Date.now() - startTime) / 1000;
          await updateEvent(eventId, {
            duration,
            payload: {
              function_name: functionName,
              arguments: serializedArgs,
              return_value: serializedReturn,
              misc: options.misc,
            },
          });
          return result;
        } catch (error) {
          const duration = (Date.now() - startTime) / 1000;
          await createErrorEvent(error as Error, eventId);
          await updateEvent(eventId, {
            duration,
            metadata: { ...(options.metadata || {}), error: true, error_message: String(error) },
          });
          throw error;
        }
      });
    } as AnyFn;
    return wrapper as F;
  };
}

// Optional helpers to update current event using ALS context
export async function updateCurrentEvent(params: { eventId?: string } & Record<string, any>): Promise<void> {
  const mod = await import('./event');
  const id = (params as any).eventId ?? getDecoratorEvent();
  if (!id) throw new Error('No active event to update');
  const { eventId, ...rest } = params as any;
  await mod.updateEvent(id, rest);
}

export function getDecoratorContext() { return als.getStore(); }

export async function withParentEvent<T>(parentEventId: string, fn: () => Promise<T>): Promise<T> {
  const parent = als.getStore();
  const ctx: DecoratorContext = { currentEventId: parentEventId, eventStack: [...(parent?.eventStack || []), parentEventId] };
  return als.run(ctx, fn);
}

