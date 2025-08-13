import { AsyncLocalStorage } from 'node:async_hooks';
import { debug } from '../util/logger';
import { getMask, getSessionId } from './init';
import { toJsonSafe, mapJsonStrings } from '../util/serialization';

type AnyFn = (...args: any[]) => any;

type DecoratorStore = { currentStepId?: string; currentEventId?: string };
const als = new AsyncLocalStorage<DecoratorStore>();

export function getDecoratorStep(): string | undefined {
  return als.getStore()?.currentStepId;
}

export function getDecoratorEvent(): string | undefined {
  return als.getStore()?.currentEventId;
}

export function step(options: {
  state?: string;
  action?: string;
  goal?: string;
  screenshotPath?: string;
  evalScore?: number;
  evalDescription?: string;
} = {}) {
  return function <F extends AnyFn>(fn: F): F {
    const wrapper = async function(this: any, ...args: any[]) {
      // If not initialized or no session, run through
      if (!getSessionId()) {
        debug('No active session, running function without step decorator');
        return await fn.apply(this, args);
      }

      const mod = await import('./step');
      const stepId = await mod.createStep(options);
      const prev = als.getStore() ?? {};
      return await als.run({ ...prev, currentStepId: stepId }, async () => {
        try {
          const result = await fn.apply(this, args);
          await mod.endStep({ stepId });
          return result;
        } catch (e) {
          await mod.endStep({ stepId, evalScore: 0.0, evalDescription: `Step failed with error: ${String(e)}` });
          throw e;
        }
      });
    } as AnyFn;
    return wrapper as F;
  };
}

export function event(options: {
  description?: string;
  result?: string;
  model?: string;
  costAdded?: number;
} = {}) {
  return function <F extends AnyFn>(fn: F): F {
    const wrapper = async function(this: any, ...args: any[]) {
      // If not initialized or no session, run through
      if (!getSessionId()) {
        debug('No active session, running function without event decorator');
        return await fn.apply(this, args);
      }

      const mod = await import('./event');
      const mask = getMask();

      // Build description from inputs if not provided
      let description = options.description;
      if (!description) {
        const parts: string[] = [];
        for (let i = 0; i < args.length; i++) {
          const val = args[i];
          let printed: string;
          try { printed = JSON.stringify(val); } catch { printed = String(val); }
          parts.push(`arg${i}=${printed}`);
        }
        description = `${fn.name || 'anonymous'}(${parts.join(', ')})`;
        if (mask) description = mask(description);
        if (description.length > 4096) description = description.slice(0, 4096) + '…';
      }

      // Link to active step if present
      const stepId = getDecoratorStep();
      const functionName = fn.name || 'anonymous';
      let serializedArgs = toJsonSafe(args);
      if (mask) {
        serializedArgs = mapJsonStrings(serializedArgs, mask);
      }
      const eventId = await mod.createEvent({
        description,
        stepId,
        model: options.model,
        costAdded: options.costAdded,
        functionName,
        arguments: serializedArgs,
      });
      const prev = als.getStore() ?? {};
      return await als.run({ ...prev, currentEventId: eventId }, async () => {
        try {
          const result = await fn.apply(this, args);
          let finalResult = options.result;
          if (!finalResult) {
            try { finalResult = JSON.stringify(result); } catch { finalResult = String(result); }
            if (mask) finalResult = mask(finalResult);
            if (finalResult.length > 4096) finalResult = finalResult.slice(0, 4096) + '…';
          }
          await mod.endEvent({
            eventId,
            result: finalResult,
            model: options.model,
            costAdded: options.costAdded,
            functionName,
            arguments: serializedArgs,
          });
          return result;
        } catch (e) {
          const errStr = `Error: ${String(e)}`;
          await mod.endEvent({
            eventId,
            result: mask ? mask(errStr) : errStr,
            model: options.model,
            costAdded: options.costAdded,
            functionName,
            arguments: serializedArgs,
          });
          throw e;
        }
      });
    } as AnyFn;
    return wrapper as F;
  };
}

// Optional helpers to update current step/event using ALS context
export async function updateCurrentStep(params: { stepId?: string } & Record<string, any>): Promise<void> {
  const mod = await import('./step');
  const id = (params as any).stepId ?? getDecoratorStep();
  if (!id) throw new Error('No active step to update');
  await mod.updateStep({ ...(params as any), stepId: id });
}

export async function updateCurrentEvent(params: { eventId?: string } & Record<string, any>): Promise<void> {
  const mod = await import('./event');
  const id = (params as any).eventId ?? getDecoratorEvent();
  if (!id) throw new Error('No active event to update');
  await mod.updateEvent({ ...(params as any), eventId: id });
}

