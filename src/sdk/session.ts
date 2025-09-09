import { UpdateSessionParams } from '../client/types';
import { getHttp, getSessionId, clearState } from './init';
import { getActiveSessionFromAls } from '../telemetry/sessionContext';
import { SessionResource } from '../client/resources/session';
import { debug, info } from '../util/logger';
import { getErrorBoundaryInstance } from './error-boundary';
import { shutdownManager } from './shutdown-manager';

export async function updateSession(params: UpdateSessionParams): Promise<void> {
    const http = getHttp();
    const fromAls = getActiveSessionFromAls().sessionId;
    const sessionId = fromAls ?? getSessionId();
    if (!sessionId) return;
    
    // check if session was emergency-ended
    if (getErrorBoundaryInstance().isSessionEmergencyEnded(sessionId)) {
        debug(`Skipping session update for emergency-ended session ${sessionId}`);
        return;
    }
    
    const res = new SessionResource(http);
    await res.updateSession(sessionId, params);
}

export async function endSession(params: UpdateSessionParams = {}): Promise<void> {
    const http = getHttp();
    const fromAls = getActiveSessionFromAls().sessionId;
    const globalSessionId = getSessionId();
    const sessionId = fromAls ?? globalSessionId;
    if (!sessionId) return;
    
    // check if session was already emergency-ended
    if (getErrorBoundaryInstance().isSessionEmergencyEnded(sessionId)) {
        debug(`Session ${sessionId} already emergency-ended, skipping normal end`);
        return;
    }
    
    // if ending the globally active session, perform cleanup
    const isGlobalSession = sessionId === globalSessionId;
  
  // Send the end session request
  const res = new SessionResource(http);
  await res.endSession(sessionId, params);
  
  // Unregister from shutdown manager
  shutdownManager.unregisterSession(sessionId);
  info(`Session ${sessionId} ended and unregistered from shutdown manager`);
  
  if (isGlobalSession) {
    // Clear global state (but keep event queue running for future sessions)
    clearState();
  }
}

