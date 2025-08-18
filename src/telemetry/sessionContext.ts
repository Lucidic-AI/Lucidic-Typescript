import { AsyncLocalStorage } from 'node:async_hooks';
import { debug } from '../util/logger';

export type SessionStore = { sessionId?: string };

const sessionAls = new AsyncLocalStorage<SessionStore>();

export function getActiveSessionFromAls(): SessionStore {
  return sessionAls.getStore() ?? {};
}

export function setActiveSession(sessionId: string): void {
  sessionAls.enterWith({ sessionId });
  debug('ALS active session set', { sessionId });
}

export function withSession<T>(sessionId: string, fn: () => T): T {
  return sessionAls.run({ sessionId }, fn);
}

export function clearActiveSession(): void {
  sessionAls.enterWith({});
  debug('ALS active session cleared');
}
