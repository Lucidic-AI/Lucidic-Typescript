import { AsyncLocalStorage } from 'node:async_hooks';

export type SessionStore = { sessionId?: string };

const sessionAls = new AsyncLocalStorage<SessionStore>();

export function getActiveSessionFromAls(): SessionStore {
  return sessionAls.getStore() ?? {};
}

export function withSession<T>(sessionId: string, fn: () => T): T {
  return sessionAls.run({ sessionId }, fn);
}
