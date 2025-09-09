import { init } from './init';
import { endSession } from './session';
import type { InitParams } from '../client/types';
import { withSession } from '../telemetry/sessionContext';
import { debug } from '../util/logger';

/**
 * Context manager for a full session lifecycle.
 * - Initializes a session
 * - Sets active session for the async scope
 * - Runs the provided function
 * - Always clears active session and ends the session afterwards
 *
 * Note: Any autoEnd flag provided is ignored; the context manager will end the session on completion.
 */
export async function withLucidic<T>(params: InitParams, fn: () => Promise<T> | T): Promise<T> {
  if (params.autoEnd !== undefined) {
    debug('withLucidic: Ignoring autoEnd; context manager will end the session automatically.');
  }
  const sessionId = await init({ ...params, autoEnd: false });
  return await withSession(sessionId, async () => {
    try {
      return await fn();
    } finally {
      await endSession({});
    }
  });
}
