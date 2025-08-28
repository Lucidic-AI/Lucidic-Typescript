import { 
  EventParams,
  EventType,
  BaseEventParams,
  LLMGenerationEventParams,
  FunctionCallEventParams,
  ErrorTracebackEventParams,
  GenericEventParams
} from '../client/types';
import { getHttp, getSessionId, getAgentId } from './init';
import { EventResource } from '../client/resources/event';
import { getDecoratorContext } from './decorators';
import { debug } from '../util/logger';

function isLLMGenerationEvent(params: EventParams): params is LLMGenerationEventParams {
  return (params as any).type === 'llm_generation';
}

function isFunctionCallEvent(params: EventParams): params is FunctionCallEventParams {
  return (params as any).type === 'function_call';
}

function isErrorTracebackEvent(params: EventParams): params is ErrorTracebackEventParams {
  return (params as any).type === 'error_traceback';
}

function isGenericEvent(params: EventParams): params is GenericEventParams {
  return !(params as any).type || (params as any).type === 'generic';
}

export async function createEvent(params: EventParams = {} as GenericEventParams): Promise<string | undefined> {
  const http = getHttp();
  const sessionId = getSessionId();
  if (!sessionId) return;

  const type: EventType = (params as any).type ?? 'generic';

  const decoratorContext = getDecoratorContext();
  const parentEventId = (params as any).parentEventId ?? decoratorContext?.currentEventId;
  const occurredAt = (params as any).occurredAt ?? new Date().toISOString();

  let payload: any;
  if (isLLMGenerationEvent(params)) {
    payload = params.payload;
  } else if (isFunctionCallEvent(params)) {
    payload = params.payload;
  } else if (isErrorTracebackEvent(params)) {
    payload = params.payload;
  } else if (isGenericEvent(params)) {
    payload = params.payload ?? { details: '' };
  }

  debug('Creating event', { type, parentEventId });
  const res = new EventResource(http);
  const { event_id } = await res.initEvent({
    type,
    parentEventId,
    occurredAt,
    tags: (params as any).tags,
    metadata: (params as any).metadata,
    payload,
    duration: (params as any).duration,
    screenshots: (params as any).screenshots,
    sessionId,
    agentId: getAgentId(),
  });
  return event_id;
}

export async function updateEvent(eventId: string, updates: Partial<BaseEventParams> & { payload?: any }): Promise<void> {
  const http = getHttp();
  const res = new EventResource(http);
  await res.updateEvent(eventId, updates);
}

export async function endEvent(_eventId: string): Promise<void> {
  // In new model, no-op placeholder to keep API surface if needed by callers
}

export function createEventOverload(params?: GenericEventParams): Promise<string | undefined>;
export function createEventOverload(params: LLMGenerationEventParams): Promise<string | undefined>;
export function createEventOverload(params: FunctionCallEventParams): Promise<string | undefined>;
export function createEventOverload(params: ErrorTracebackEventParams): Promise<string | undefined>;
export function createEventOverload(params: EventParams): Promise<string | undefined>;

