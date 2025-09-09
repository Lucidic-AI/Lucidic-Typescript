import { debug, info } from '../util/logger';
import { EventQueue } from './event-queue';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

interface SessionState {
  sessionId?: string;
  agentId?: string;
  http?: any;
  eventQueue?: EventQueue;
  isShuttingDown?: boolean;
  provider?: NodeTracerProvider | null;
  autoEnd?: boolean;
}

/**
 * singleton manager for coordinating shutdown across all active sessions
 * ensures process listeners are only registered once and all sessions are properly ended
 */
class ShutdownManager {
  private static instance: ShutdownManager;
  private activeSessions = new Map<string, SessionState>();
  private isShuttingDown = false;
  private shutdownPromise: Promise<void> | null = null;
  private listenersRegistered = false;
  private sharedProvider: NodeTracerProvider | null = null;
  private sharedEventQueue: EventQueue | null = null;

  private constructor() {
    // private constructor for singleton pattern
  }

  static getInstance(): ShutdownManager {
    if (!ShutdownManager.instance) {
      ShutdownManager.instance = new ShutdownManager();
    }
    return ShutdownManager.instance;
  }

  registerSession(sessionId: string, state: SessionState): void {
    debug(`Registering session ${sessionId} with shutdown manager`);
    this.activeSessions.set(sessionId, state);
    
    // Track shared resources (only store first non-null instances)
    if (state.provider && !this.sharedProvider) {
      this.sharedProvider = state.provider;
      debug('Shared provider tracked for shutdown');
    }
    if (state.eventQueue && !this.sharedEventQueue) {
      this.sharedEventQueue = state.eventQueue;
      debug('Shared event queue tracked for shutdown');
    }
    
    this.ensureListenersRegistered();
  }

  unregisterSession(sessionId: string): void {
    debug(`Unregistering session ${sessionId} from shutdown manager`);
    this.activeSessions.delete(sessionId);
  }

  getActiveSessionCount(): number {
    return this.activeSessions.size;
  }

  isSessionActive(sessionId: string): boolean {
    return this.activeSessions.has(sessionId);
  }

  private ensureListenersRegistered(): void {
    if (this.listenersRegistered) return;
    this.listenersRegistered = true;

    debug('Registering global shutdown listeners');

    // register listeners ONCE at module level using process.once
    process.once('beforeExit', () => {
      debug('beforeExit triggered');
      void this.handleShutdown('beforeExit');
    });

    process.once('SIGINT', () => {
      debug('SIGINT received');
      this.handleShutdown('SIGINT')
        .finally(() => process.exit(0));
    });

    process.once('SIGTERM', () => {
      debug('SIGTERM received');
      this.handleShutdown('SIGTERM')
        .finally(() => process.exit(0));
    });

    process.once('uncaughtException', (err) => {
      debug('Uncaught exception:', err);
      void this.handleUncaughtException(err);
    });
  }

  private async handleShutdown(signal: string): Promise<void> {
    if (this.isShuttingDown) {
      debug(`Already shutting down, ignoring ${signal}`);
      return;
    }

    if (this.shutdownPromise) {
      debug(`Shutdown already in progress, waiting...`);
      return this.shutdownPromise;
    }

    this.isShuttingDown = true;
    info(`Shutdown initiated by ${signal}, ending ${this.activeSessions.size} active sessions`);

    this.shutdownPromise = this.performShutdown();
    return this.shutdownPromise;
  }

  private async performShutdown(): Promise<void> {
    const sessionPromises: Promise<void>[] = [];

    // end all active sessions in parallel
    for (const [sessionId, state] of this.activeSessions) {
      if (state.autoEnd !== false) {
        sessionPromises.push(this.endSession(sessionId, state));
      }
    }

    // wait for all sessions to end with timeout
    const timeout = new Promise<void>((resolve) => 
      setTimeout(() => {
        debug('Shutdown timeout reached after 20s');
        resolve();
      }, 20000)
    );

    await Promise.race([
      Promise.all(sessionPromises),
      timeout
    ]);

    // After all sessions are ended, shutdown shared resources ONCE
    debug('All sessions ended, shutting down shared resources');
    
    // Shutdown OpenTelemetry provider (this may create events)
    if (this.sharedProvider) {
      debug('Shutting down shared OpenTelemetry provider');
      try {
        await this.sharedProvider.shutdown();
      } catch (e) {
        debug('Error shutting down shared provider:', e);
      }
    }
    
    // Final flush to ensure any events from provider shutdown are sent
    if (this.sharedEventQueue) {
      debug('Final flush for provider shutdown events');
      try {
        await this.sharedEventQueue.forceFlush();
      } catch (e) {
        debug('Error in final flush:', e);
      }
    }
    
    // Now shutdown the event queue
    if (this.sharedEventQueue) {
      debug('Shutting down shared event queue');
      try {
        await this.sharedEventQueue.shutdown();
      } catch (e) {
        debug('Error shutting down shared event queue:', e);
      }
    }

    info('Shutdown complete');
  }

  private async endSession(sessionId: string, state: SessionState): Promise<void> {
    try {
      info(`Ending session ${sessionId}...`);

      // mark as shutting down to prevent duplicate cleanup
      if (state.isShuttingDown) {
        debug(`Session ${sessionId} already shutting down`);
        return;
      }
      state.isShuttingDown = true;

      // 1. First flush of event queue
      if (state.eventQueue) {
        debug(`Flushing event queue for session ${sessionId}`);
        try {
          await state.eventQueue.forceFlush();
        } catch (e) {
          debug(`Error flushing event queue for session ${sessionId}:`, e);
        }
      }

      // 2. Flush OpenTelemetry provider (but don't shutdown - it's shared)
      if (state.provider) {
        debug(`Flushing OpenTelemetry provider for session ${sessionId}`);
        try {
          await state.provider.forceFlush();
        } catch (e) {
          debug(`Error flushing provider for session ${sessionId}:`, e);
        }
        // Note: provider.shutdown() moved to performShutdown() to run once after all sessions
      }

      // 3. Flush event queue again for any events created during provider flush
      if (state.eventQueue) {
        debug(`Second flush for events in session ${sessionId}`);
        try {
          await state.eventQueue.forceFlush();
        } catch (e) {
          debug(`Error in second flush for session ${sessionId}:`, e);
        }
      }

      // 4. End the session via API - use the SessionResource directly with specific sessionId
      if (state.http && sessionId) {
        const { SessionResource } = await import('../client/resources/session.js');
        const sessionResource = new SessionResource(state.http);
        await sessionResource.endSession(sessionId, {});
        info(`Session ${sessionId} ended via API`);
      }

      // Note: eventQueue.shutdown() moved to performShutdown() to run once after all sessions

      debug(`Session ${sessionId} ended successfully`);
      this.unregisterSession(sessionId);

    } catch (e) {
      debug(`Error ending session ${sessionId}:`, e);
    }
  }

  private async handleUncaughtException(err: any): Promise<void> {
    // handle uncaught exception by creating crash event and ending sessions
    debug('Handling uncaught exception:', err);

    // import dynamically to avoid circular dependency
    const initModule = await import('./init.js');
    await initModule.handleFatalUncaught(err, 1);
  }

  // for testing purposes
  reset(): void {
    this.activeSessions.clear();
    this.isShuttingDown = false;
    this.shutdownPromise = null;
    // note: we don't reset listenersRegistered as process listeners persist
  }
}

export const shutdownManager = ShutdownManager.getInstance();
export type { SessionState };