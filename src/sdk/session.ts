import { UpdateSessionParams } from '../client/types';
import { getHttp, getSessionId, getEventQueue, clearState } from './init';
import { getActiveSessionFromAls } from '../telemetry/sessionContext';
import { SessionResource } from '../client/resources/session';
import { debug, info } from '../util/logger';

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
  const globalSessionId = getSessionId();
  const sessionId = fromAls ?? globalSessionId;
  if (!sessionId) return;
  
  // If ending the globally active session, perform cleanup
  const isGlobalSession = sessionId === globalSessionId;
  
  if (isGlobalSession) {
    // Flush event queue before ending session
    const eventQueue = getEventQueue();
    if (eventQueue) {
      try {
        debug('Flushing event queue before ending session');
        await eventQueue.forceFlush();
      } catch (e) {
        debug('Error flushing event queue before end session:', e);
      }
    }
  }
  
  // Send the end session request
  const res = new SessionResource(http);
  await res.endSession(sessionId, params);
  
  if (isGlobalSession) {
    // Shutdown event queue after ending session
    const eventQueue = getEventQueue();
    if (eventQueue) {
      try {
        await eventQueue.shutdown();
      } catch (e) {
        debug('Error shutting down event queue after end session:', e);
      }
    }
    
    // Clear global state
    clearState();
  }
}

