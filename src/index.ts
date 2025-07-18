import { Client } from './client';
import { LucidicTelemetry } from './telemetry/otelInit';
import { logger } from './utils/logger';
import { 
  LucidicConfig, 
  SessionConfig, 
  StepConfig, 
  EventConfig,
  MassSimulationConfig 
} from './types';
import { Session } from './primitives/session';
import { Step } from './primitives/step';
import { Event } from './primitives/event';
import { runWithImageStorage } from './telemetry/utils/imageStorage';
import { runWithTextStorage } from './telemetry/utils/textStorage';

// Global client instance
let globalClient: Client | null = null;

/**
 * Initialize Lucidic AI SDK
 * @param config Configuration options
 */
export async function init(config?: LucidicConfig): Promise<string> {
  try {
    // Create client
    globalClient = new Client(config);

    // Initialize client (verify API key)
    await globalClient.initialize();

    // Initialize OpenTelemetry if providers are specified
    if (config?.providers && config.providers.length > 0) {
      const telemetry = LucidicTelemetry.getInstance();
      telemetry.setClientGetter(() => globalClient);
      telemetry.initialize(globalClient.getAgentId(), 'lucidic-ai');
      telemetry.instrumentProviders(config.providers);
    }

    // Auto-create session if session name provided
    let sessionId = '';
    if (config?.sessionName || config?.sessionId) {
      const session = await initSession({
        sessionName: config.sessionName,
        sessionId: config.sessionId,
        task: config.task,
        agentId: config.agentId,
        userId: config.userId,
        groupId: config.groupId,
        testId: config.testId
      });
      sessionId = session.sessionId;
    }

    logger.info('Lucidic AI SDK initialized');
    return sessionId;
  } catch (error) {
    logger.error('Failed to initialize Lucidic AI SDK:', error);
    throw error;
  }
}

/**
 * Get the global client instance
 */
function getClient(): Client {
  if (!globalClient) {
    throw new Error('Lucidic AI SDK not initialized. Call init() first.');
  }
  return globalClient;
}

/**
 * Initialize a new session
 */
export async function initSession(config: SessionConfig): Promise<Session> {
  const client = getClient();
  return await client.initSession(config);
}

/**
 * Continue an existing session
 */
export async function continueSession(sessionId: string): Promise<Session> {
  const client = getClient();
  return await client.continueSession(sessionId);
}

/**
 * Update the current session
 */
export async function updateSession(
  task?: string,
  tags?: Record<string, any>,
  isFinished?: boolean,
  isSuccessful?: boolean,
  isSuccessfulReason?: string
): Promise<void> {
  const client = getClient();
  if (!client.session) {
    throw new Error('No active session');
  }
  
  await client.session.updateSession(task, tags, isFinished, isSuccessful, isSuccessfulReason);
}

/**
 * End the current session
 */
export async function endSession(isSuccessful: boolean = true, reason?: string): Promise<void> {
  const client = getClient();
  if (!client.session) {
    throw new Error('No active session');
  }
  
  await client.session.endSession(isSuccessful, reason);
  
  // Uninstrument providers
  const telemetry = LucidicTelemetry.getInstance();
  if (telemetry.isInitialized()) {
    telemetry.uninstrumentAll();
  }
}

/**
 * Create a new step
 */
export async function createStep(config: StepConfig): Promise<Step> {
  const client = getClient();
  if (!client.session) {
    throw new Error('No active session');
  }
  
  return await client.session.createStep(config);
}

/**
 * Update a step
 */
export async function updateStep(
  stepId: string,
  isFinished?: boolean,
  evalScore?: number,
  evalDescription?: string
): Promise<void> {
  const client = getClient();
  await client.updateStep(stepId, isFinished, evalScore, evalDescription);
}

/**
 * End the current step
 */
export async function endStep(evalScore?: number, evalDescription?: string): Promise<void> {
  const client = getClient();
  if (!client.session) {
    throw new Error('No active session');
  }
  
  await client.session.endStep(evalScore, evalDescription);
}

/**
 * Create a new event
 */
export async function createEvent(config: EventConfig): Promise<Event> {
  const client = getClient();
  if (!client.session) {
    throw new Error('No active session');
  }
  
  return await client.session.createEvent(config);
}

/**
 * Update an event
 */
export async function updateEvent(
  eventId: string,
  result?: string,
  isFinished?: boolean,
  costAdded?: number,
  model?: string
): Promise<void> {
  const client = getClient();
  if (!client.session) {
    throw new Error('No active session');
  }
  
  await client.session.updateEvent(eventId, result, isFinished, costAdded, model);
}

/**
 * Get a prompt from the platform
 */
export async function getPrompt(promptName: string, withCache: boolean = true): Promise<string> {
  const client = getClient();
  return await client.getPrompt(promptName, withCache);
}

/**
 * Upload an image
 */
export async function uploadImage(imageData: Buffer | string): Promise<string> {
  const client = getClient();
  return await client.uploadImage(imageData);
}

/**
 * Run mass simulation
 */
export async function runMassSimulation(config: MassSimulationConfig): Promise<void> {
  const client = getClient();
  return await client.runMassSimulation(config);
}

/**
 * Set masking function
 */
export function setMaskingFunction(fn: (text: string) => string): void {
  const client = getClient();
  client.maskingFunction = fn;
}

/**
 * Get the current session
 */
export function getSession(): Session | null {
  const client = getClient();
  return client.session;
}

/**
 * Get the current active step
 */
export function getActiveStep(): Step | null {
  const client = getClient();
  return client.session?.getActiveStep() || null;
}

/**
 * Wrap an async function to run with storage contexts
 * This ensures multimodal content is properly captured
 */
export function withStorageContext<T extends (...args: any[]) => Promise<any>>(fn: T): T {
  return (async (...args: any[]) => {
    return runWithImageStorage(() => 
      runWithTextStorage(() => fn(...args))
    );
  }) as T;
}

// Re-export types and classes
export * from './types';
export { Client } from './client';
export { Session } from './primitives/session';
export { Step } from './primitives/step';
export { Event } from './primitives/event';
export { LucidicError, APIError, ConfigurationError, SessionError, StepError, EventError } from './errors';