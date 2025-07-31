import { Client } from './client';
import { LucidicTelemetry } from './telemetry/otelInit';
import { logger } from './utils/logger';
import { 
  LucidicConfig, 
  SessionConfig, 
  StepConfig, 
  EventConfig,
  MassSimulationConfig,
  CreateStepParams,
  EndStepParams,
  CreateEventParams,
  UpdateEventParams,
  GetPromptParams
} from './types';
import { Session } from './primitives/session';
import { Step } from './primitives/step';
import { Event } from './primitives/event';
import { runWithImageStorage } from './telemetry/utils/imageStorage';
import { runWithTextStorage } from './telemetry/utils/textStorage';
import { PromptError } from './errors';

// Global client instance
let globalClient: Client | null = null;

// Track if exit handlers are registered
let exitHandlersRegistered = false;

/**
 * Auto-end session on exit
 */
async function autoEndSession(): Promise<void> {
  try {
    if (globalClient && globalClient.autoEnd && globalClient.session && !globalClient.session.isFinished) {
      logger.info('Auto-ending active session on exit');
      await globalClient.session.endSession(true, 'Session auto-ended on exit');
    }
  } catch (error) {
    logger.debug(`Error during auto-end session: ${error}`);
  }
}

/**
 * Cleanup telemetry
 */
async function cleanupTelemetry(): Promise<void> {
  try {
    const telemetry = LucidicTelemetry.getInstance();
    if (telemetry.isInitialized()) {
      telemetry.uninstrumentAll();
    }
  } catch (error) {
    logger.debug(`Error during telemetry cleanup: ${error}`);
  }
}

/**
 * Register exit handlers
 */
function registerExitHandlers(): void {
  if (exitHandlersRegistered) {
    return;
  }

  // Handle normal process exit
  process.on('exit', () => {
    // Note: Only synchronous operations can be performed here
    // Async operations are handled in beforeExit
  });

  // Handle async cleanup before exit
  process.on('beforeExit', async (code) => {
    await cleanupTelemetry();
    await autoEndSession();
  });

  // Handle SIGINT (Ctrl+C)
  process.on('SIGINT', async () => {
    logger.debug('Received SIGINT, shutting down gracefully...');
    await cleanupTelemetry();
    await autoEndSession();
    process.exit(0);
  });

  // Handle SIGTERM
  process.on('SIGTERM', async () => {
    logger.debug('Received SIGTERM, shutting down gracefully...');
    await cleanupTelemetry();
    await autoEndSession();
    process.exit(0);
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', async (error) => {
    logger.error('Uncaught exception:', error);
    await cleanupTelemetry();
    await autoEndSession();
    process.exit(1);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', async (reason, promise) => {
    logger.error('Unhandled rejection at:', promise, 'reason:', reason);
    await cleanupTelemetry();
    await autoEndSession();
    process.exit(1);
  });

  exitHandlersRegistered = true;
}

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

    // Register exit handlers if auto-end is enabled
    if (globalClient.autoEnd) {
      registerExitHandlers();
    }

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
 * Create a new step with named parameters
 */
export async function createStep(params?: CreateStepParams): Promise<Step> {
  const client = getClient();
  if (!client.session) {
    throw new Error('No active session');
  }
  
  const config: StepConfig = params || {};
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
 * End the current step or a specific step with named parameters
 */
export async function endStep(params?: EndStepParams): Promise<void> {
  const client = getClient();
  if (!client.session) {
    throw new Error('No active session');
  }
  
  if (!params) {
    // End current active step with no parameters
    await client.session.endStep();
    return;
  }
  
  const { stepId, evalScore, evalDescription, state, action, goal } = params;
  
  if (stepId) {
    // End specific step
    await client.updateStep(stepId, true, evalScore, evalDescription, state, action, goal);
  } else {
    // End current active step
    await client.session.endStep(evalScore, evalDescription);
  }
}

/**
 * Create a new event with named parameters
 */
export async function createEvent(params?: CreateEventParams): Promise<Event> {
  const client = getClient();
  if (!client.session) {
    throw new Error('No active session');
  }
  
  const config: EventConfig = params || {};
  return await client.session.createEvent(config);
}

/**
 * Update an event with named parameters
 */
export async function updateEvent(params?: UpdateEventParams): Promise<void> {
  const client = getClient();
  if (!client.session) {
    throw new Error('No active session');
  }
  
  if (!params || !params.eventId) {
    throw new Error('Event ID is required for updateEvent');
  }
  
  const { eventId, result, costAdded, model, description, screenshots } = params;
  
  // Note: isFinished is not in UpdateEventParams as it should be handled by endEvent
  await client.session.updateEvent(eventId, result, undefined, costAdded, model, description);
}

/**
 * Get a prompt from the platform with named parameters
 */
export async function getPrompt(params: GetPromptParams | string): Promise<string> {
  const client = getClient();
  
  // Support both string parameter (backward compatibility) and named parameters
  if (typeof params === 'string') {
    return await client.getPrompt(params);
  }
  
  const { name, variables, cache = 300, label = 'production' } = params;
  
  // Get the prompt from the API
  let prompt = await client.getPrompt(name, cache, label);
  
  // Perform variable substitution if variables are provided
  if (variables) {
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{{${key}}}`;
      const index = prompt.indexOf(placeholder);
      
      if (index === -1) {
        throw new PromptError(`Variable '${key}' not found in prompt`);
      }
      
      prompt = prompt.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value));
    }
    
    // Check for unreplaced variables
    if (prompt.includes('{{') && prompt.includes('}}')) {
      const match = prompt.match(/\{\{([^}]+)\}\}/);
      if (match) {
        logger.warn(`Unreplaced variable(s) left in prompt. Please check your prompt.`);
      }
    }
  }
  
  return prompt;
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
export { LucidicError, APIError, ConfigurationError, SessionError, StepError, EventError, PromptError } from './errors';
export { step, withStep } from './decorators';