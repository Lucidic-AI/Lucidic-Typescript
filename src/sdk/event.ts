import { 
  EventParams,
  EventType,
  BaseEventParams,
  FlexibleEventParams,
} from '../client/types';
import { getSessionId, getEventQueue } from './init';
import { getDecoratorContext } from './decorators';
import { EventBuilder } from './event-builder';
import { debug } from '../util/logger';
import * as crypto from 'crypto';

// Type guard helpers removed; flexible parameter system handles mapping

export function createEvent(description: string): string | undefined;
export function createEvent(type: EventType, details: string): string | undefined;
export function createEvent(params: FlexibleEventParams): string | undefined;
export function createEvent(arg1?: string | EventType | FlexibleEventParams, arg2?: string): string | undefined {
  // Build flexible params from overload args first to check for sessionId
  let flexibleParams: FlexibleEventParams;
  if (typeof arg1 === 'string' && !arg2) {
    flexibleParams = { details: arg1 };
  } else if (typeof arg1 === 'string' && typeof arg2 === 'string') {
    flexibleParams = { type: arg1 as EventType, details: arg2 };
  } else {
    flexibleParams = (arg1 as FlexibleEventParams) || {};
  }

  // Use provided sessionId or fall back to global
  const sessionId = flexibleParams.sessionId || getSessionId();
  if (!sessionId) return;
  const eventQueue = getEventQueue();
  if (!eventQueue) return;

  // Convert to strict typed params
  const strictParams = EventBuilder.build(flexibleParams);

  const decoratorContext = getDecoratorContext();
  // Only use decorator context as fallback if parentEventId was not explicitly provided
  // This prevents self-parenting when decorator calls createEvent from within new context
  const hasExplicitParent = 'parentEventId' in flexibleParams;
  const parentEventId = hasExplicitParent
    ? strictParams.parentEventId 
    : decoratorContext?.currentEventId;
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

  // Ensure a client event id exists
  const clientEventId = strictParams.eventId || crypto.randomUUID();

  // Queue the event for asynchronous delivery
  eventQueue.queueEvent({
    clientEventId,
    parentClientEventId: parentEventId,
    sessionId,
    type,
    occurredAt,
    duration: (strictParams as any).duration,
    tags: (strictParams as any).tags,
    metadata: (strictParams as any).metadata,
    payload,
    timestamp: Date.now(),
    retries: 0,
  });

  // Immediate return with client event id
  return clientEventId || undefined;
}

export async function endEvent(_eventId: string): Promise<void> {}

export async function flush(): Promise<void> {
  const eventQueue = getEventQueue();
  if (eventQueue) {
    return eventQueue.flush();
  }
}

export async function forceFlush(): Promise<void> {
  const eventQueue = getEventQueue();
  if (eventQueue) {
    return eventQueue.forceFlush();
  }
}