// Import all modules first (don't export directly)
import * as initModule from './sdk/init';
import * as sessionModule from './sdk/session';
import * as eventModule from './sdk/event';
import * as eventHelpersModule from './sdk/event-helpers';
import * as decoratorsModule from './sdk/decorators';
import * as experimentModule from './sdk/experiment';
import * as promptModule from './sdk/prompt';
import * as contextModule from './sdk/context';
import { 
  withSession as _withSession, 
  setActiveSession as _setActiveSession, 
  clearActiveSession as _clearActiveSession 
} from './telemetry/sessionContext';

// Import error boundary functions
import { 
  wrapSdkModule,
  isInSilentMode,
  getErrorHistory,
  clearErrorHistory,
  hasPerformedShutdown,
  type ErrorContext
} from './sdk/error-boundary';

// Wrap all modules with error boundary
// If LUCIDIC_SILENT_MODE=false, these return the original modules unchanged
const wrappedInit = wrapSdkModule(initModule, 'init');
const wrappedSession = wrapSdkModule(sessionModule, 'session');
const wrappedEvent = wrapSdkModule(eventModule, 'event');
const wrappedEventHelpers = wrapSdkModule(eventHelpersModule, 'eventHelpers');
const wrappedDecorators = wrapSdkModule(decoratorsModule, 'decorators');
const wrappedExperiment = wrapSdkModule(experimentModule, 'experiment');
const wrappedPrompt = wrapSdkModule(promptModule, 'prompt');
const wrappedContext = wrapSdkModule(contextModule, 'context');

// Wrap telemetry functions
const wrappedTelemetry = wrapSdkModule({
  withSession: _withSession,
  setActiveSession: _setActiveSession,
  clearActiveSession: _clearActiveSession
}, 'telemetry');

// Re-export all wrapped functions

// From init module
export const init = wrappedInit.init;
export const getSessionId = wrappedInit.getSessionId;
export const getHttp = wrappedInit.getHttp;
export const getAgentId = wrappedInit.getAgentId;
export const getMask = wrappedInit.getMask;
export const getPromptResource = wrappedInit.getPromptResource;
export const getEventQueue = wrappedInit.getEventQueue;
export const getLucidicTracer = wrappedInit.getLucidicTracer;
export const aiTelemetry = wrappedInit.aiTelemetry;
export const clearState = wrappedInit.clearState;
export const hasHttp = wrappedInit.hasHttp;
export const getAgentIdSafe = wrappedInit.getAgentIdSafe;
export const getOrCreateHttp = wrappedInit.getOrCreateHttp;

// From session module
export const updateSession = wrappedSession.updateSession;
export const endSession = wrappedSession.endSession;

// From event module
export const createEvent = wrappedEvent.createEvent;
export const endEvent = wrappedEvent.endEvent;
export const flush = wrappedEvent.flush;
export const forceFlush = wrappedEvent.forceFlush;

// From event helpers
export const createLLMEvent = wrappedEventHelpers.createLLMEvent;
export const createFunctionEvent = wrappedEventHelpers.createFunctionEvent;
export const createErrorEvent = wrappedEventHelpers.createErrorEvent;
export const createGenericEvent = wrappedEventHelpers.createGenericEvent;
export const createEventWithMisc = wrappedEventHelpers.createEventWithMisc;

// From decorators
export const event = wrappedDecorators.event;
export const getDecoratorContext = wrappedDecorators.getDecoratorContext;
export const getDecoratorEvent = wrappedDecorators.getDecoratorEvent;
export const withParentEvent = wrappedDecorators.withParentEvent;

// From experiment
export const createExperiment = wrappedExperiment.createExperiment;

// From prompt
export const getPrompt = wrappedPrompt.getPrompt;
export const getRawPrompt = wrappedPrompt.getRawPrompt;

// From context
export const withLucidic = wrappedContext.withLucidic;

// From telemetry
export const withSession = wrappedTelemetry.withSession;
export const setActiveSession = wrappedTelemetry.setActiveSession;
export const clearActiveSession = wrappedTelemetry.clearActiveSession;

// Export error boundary utilities
export {
  isInSilentMode,
  getErrorHistory,
  clearErrorHistory,
  hasPerformedShutdown,
  type ErrorContext
};

// Export types (these don't need wrapping)
export * from './client/types';

export * from './sdk/dataset';