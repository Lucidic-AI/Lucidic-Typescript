import { AsyncLocalStorage } from 'node:async_hooks';
import { debug } from '../util/logger';

export type SessionStore = { sessionId?: string; agentId?: string };

const sessionAls = new AsyncLocalStorage<SessionStore>();

export function getActiveSessionFromAls(): SessionStore {
  return sessionAls.getStore() ?? {};
}

export function setActiveSession(sessionId: string, agentId?: string): void {
  sessionAls.enterWith({ sessionId, agentId });
  debug('ALS active session set', { sessionId, agentId });
}

export function withSession<T>(sessionId: string, agentId: string | undefined, fn: () => T): T {
  return sessionAls.run({ sessionId, agentId }, fn);
}
