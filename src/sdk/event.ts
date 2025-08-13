import { EventParams } from '../client/types';
import { getHttp, getSessionId, getAgentId } from './init';
import { EventResource } from '../client/resources/event';

export async function createEvent(params: EventParams = {}): Promise<string | undefined> {
  const http = getHttp();
  const sessionId = getSessionId();
  if (!sessionId) return;
  const res = new EventResource(http);
  const { event_id } = await res.initEvent({ ...params, sessionId, agentId: getAgentId() });
  return event_id;
}

export async function updateEvent(params: EventParams): Promise<void> {
  const http = getHttp();
  if (!params.eventId) throw new Error('No active event to update');
  const res = new EventResource(http);
  await res.updateEvent(params.eventId, params);
}

export async function endEvent(params: EventParams = {}): Promise<void> {
  const http = getHttp();
  if (!params.eventId) throw new Error('No active event to end');
  const res = new EventResource(http);
  await res.updateEvent(params.eventId, { ...params, result: params.result ?? 'Response received' });
}

