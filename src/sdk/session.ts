import { UpdateSessionParams } from '../client/types';
import { getHttp, getSessionId } from './init';
import { getActiveSessionFromAls } from '../telemetry/sessionContext';
import { SessionResource } from '../client/resources/session';

export async function updateSession(params: UpdateSessionParams): Promise<void> {
  const http = getHttp();
  const fromAls = getActiveSessionFromAls().sessionId;
  const sessionId = fromAls ?? getSessionId();
  if (!sessionId) return;
  const res = new SessionResource(http);
  await res.updateSession(sessionId, params);
}

export async function endSession(params: UpdateSessionParams = {}): Promise<void> {
  const http = getHttp();
  const fromAls = getActiveSessionFromAls().sessionId;
  const sessionId = fromAls ?? getSessionId();
  if (!sessionId) return;
  const res = new SessionResource(http);
  await res.endSession(sessionId, params);
}

