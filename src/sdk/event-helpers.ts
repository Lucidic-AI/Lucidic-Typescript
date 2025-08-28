import {
  EventType,
  LLMGenerationPayload,
  FunctionCallPayload,
  ErrorTracebackPayload,
  GenericEventPayload,
} from '../client/types';
import { createEvent } from './event';
import { toJsonSafe } from '../util/serialization';

export function createEventWithMisc<T extends Record<string, any>>(
  type: EventType,
  payload: Partial<LLMGenerationPayload | FunctionCallPayload | ErrorTracebackPayload | GenericEventPayload>,
  misc: T,
  baseParams?: {
    parentEventId?: string;
    tags?: string[];
    metadata?: Record<string, any>;
    duration?: number;
    screenshots?: string[];
  }
): Promise<string | undefined> {
  const fullPayload = { ...payload, misc } as any;
  return createEvent({
    ...(baseParams || {}),
    type,
    payload: fullPayload,
  } as any);
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
    parentEventId,
    payload: {
      request: { provider, model, messages },
      response: { output: response },
      usage: usage || {},
    },
  } as any);
}

export function createFunctionEvent(
  functionName: string,
  args?: any,
  returnValue?: any,
  parentEventId?: string
): Promise<string | undefined> {
  return createEvent({
    type: 'function_call',
    parentEventId,
    payload: {
      function_name: functionName,
      arguments: toJsonSafe(args),
      return_value: returnValue == null ? undefined : toJsonSafe(returnValue),
    },
  } as any);
}

export function createErrorEvent(error: string | Error, parentEventId?: string): Promise<string | undefined> {
  const message = error instanceof Error ? error.message : String(error);
  const traceback = error instanceof Error ? error.stack : undefined;
  return createEvent({
    type: 'error_traceback',
    parentEventId,
    payload: { error: message, traceback: traceback || '' },
  } as any);
}

export function createGenericEvent(
  details?: string,
  misc?: Record<string, any>,
  parentEventId?: string
): Promise<string | undefined> {
  return createEvent({
    type: 'generic',
    parentEventId,
    payload: { details: details || '', misc },
  } as any);
}


