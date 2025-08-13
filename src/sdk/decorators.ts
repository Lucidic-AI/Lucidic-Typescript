type AnyFn = (...args: any[]) => any;

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
      const mod = await import('./step');
      const stepId = await mod.createStep(options);
      try {
        const result = await fn.apply(this, args);
        await mod.endStep({ stepId });
        return result;
      } catch (e) {
        await mod.endStep({ stepId, evalScore: 0.0, evalDescription: `Step failed with error: ${String(e)}` });
        throw e;
      }
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
      const mod = await import('./event');
      const eventId = await mod.createEvent({ description: options.description });
      try {
        const result = await fn.apply(this, args);
        const finalResult = options.result ?? (() => {
          try { return JSON.stringify(result); } catch { return String(result); }
        })();
        await mod.endEvent({ eventId, result: finalResult, model: options.model, costAdded: options.costAdded });
        return result;
      } catch (e) {
        await mod.endEvent({ eventId, result: `Error: ${String(e)}`, model: options.model, costAdded: options.costAdded });
        throw e;
      }
    } as AnyFn;
    return wrapper as F;
  };
}

