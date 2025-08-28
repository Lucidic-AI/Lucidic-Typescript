import { 
  EventParams,
  EventType,
  BaseEventParams,
  FlexibleEventParams,
} from '../client/types';
import { getHttp, getSessionId, getAgentId } from './init';
import { EventResource } from '../client/resources/event';
import { getDecoratorContext } from './decorators';
import { debug } from '../util/logger';
import { EventBuilder } from './event-builder';

// Type guard helpers removed; flexible parameter system handles mapping

export async function createEvent(description: string): Promise<string | undefined>;
export async function createEvent(type: EventType, details: string): Promise<string | undefined>;
export async function createEvent(params: FlexibleEventParams): Promise<string | undefined>;
export async function createEvent(arg1?: string | EventType | FlexibleEventParams, arg2?: string): Promise<string | undefined> {
  const http = getHttp();
  const sessionId = getSessionId();
  if (!sessionId) return;

  // Build flexible params from overload args
  let flexibleParams: FlexibleEventParams;
  if (typeof arg1 === 'string' && !arg2) {
    flexibleParams = { details: arg1 };
  } else if (typeof arg1 === 'string' && typeof arg2 === 'string') {
    flexibleParams = { type: arg1 as EventType, details: arg2 };
  } else {
    flexibleParams = (arg1 as FlexibleEventParams) || {};
  }

  // Convert to strict typed params
  const strictParams = EventBuilder.build(flexibleParams);

  const decoratorContext = getDecoratorContext();
  const parentEventId = strictParams.parentEventId || decoratorContext?.currentEventId;
  const occurredAt = strictParams.occurredAt || new Date().toISOString();
  
  // Extract event type and payload based on discriminated union
  let type: EventType;
  let payload: any;
  
  if ('type' in strictParams && strictParams.type) {
    type = strictParams.type;
    payload = strictParams.payload;
  } else {
    // GenericEventParams may omit type
    type = 'generic';
    payload = strictParams.payload ?? { details: '' };
  }

  debug('Creating event', { type, parentEventId });
  const res = new EventResource(http);
  const { event_id } = await res.initEvent({
    type,
    parentEventId,
    occurredAt,
    tags: strictParams.tags,
    metadata: strictParams.metadata,
    payload,
    duration: strictParams.duration,
    screenshots: strictParams.screenshots,
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

export async function endEvent(_eventId: string): Promise<void> {}

// Note: Overloads are unnecessary since createEvent accepts the union type directly.