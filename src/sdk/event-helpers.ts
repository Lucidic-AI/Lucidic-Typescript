import { FlexibleEventParams } from '../client/types';
import { createEvent } from './event';
import { toJsonSafe } from '../util/serialization';

export function createEventWithMisc(params: FlexibleEventParams, misc: Record<string, any>): Promise<string | undefined> {
  return createEvent({ ...(params || {}), ...(misc || {}) });
}

export function createLLMEvent(
  provider: string,
  model: string,
  messages: any[],
  response: any,
  usage?: { input_tokens?: number; output_tokens?: number; cost?: number },
  parentEventId?: string
): Promise<string | undefined> {
  return createEvent({
    type: 'llm_generation',
    provider,
    model,
    messages,
    output: response,
    ...(usage || {}),
    parentEventId,
  });
}

export function createFunctionEvent(
  functionName: string,
  args?: any,
  returnValue?: any,
  parentEventId?: string
): Promise<string | undefined> {
  return createEvent({
    type: 'function_call',
    function_name: functionName,
    arguments: toJsonSafe(args),
    return_value: returnValue == null ? undefined : toJsonSafe(returnValue),
    parentEventId,
  });
}

export function createErrorEvent(error: string | Error, parentEventId?: string): Promise<string | undefined> {
  return createEvent({ type: 'error_traceback', error, parentEventId });
}

export function createGenericEvent(details?: string, misc?: Record<string, any>, parentEventId?: string): Promise<string | undefined> {
  return createEvent({ type: 'generic', details, parentEventId, ...(misc || {}) });
}


