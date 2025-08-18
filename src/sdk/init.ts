import { InitParams, ProviderType } from '../client/types';
import { HttpClient } from '../client/httpClient';
import { SessionResource } from '../client/resources/session';
import { PromptResource } from '../client/resources/prompt';
import { buildTelemetry } from '../telemetry/init';
import { trace } from '@opentelemetry/api';
import type { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { info, debug } from '../util/logger';

type State = {
  http: HttpClient | null;
  sessionId: string | null;
  agentId: string | null;
  masking?: (text: string) => string;
  prompt?: PromptResource;
  isShuttingDown?: boolean;
  provider?: NodeTracerProvider | null;
};

const state: State = {
  http: null,
  sessionId: null,
  agentId: null,
};

export async function init(params: InitParams = {}): Promise<string> {
  const apiKey = params.apiKey ?? process.env.LUCIDIC_API_KEY;
  const agentId = params.agentId ?? process.env.LUCIDIC_AGENT_ID;
  if (!apiKey) throw new Error('LUCIDIC_API_KEY not provided');
  if (!agentId) throw new Error('LUCIDIC_AGENT_ID not provided');

  const http = new HttpClient({ baseUrl: params.baseUrl, apiKey });
  const sessionRes = new SessionResource(http);
  info('Initializing session with backend...');
  const { session_id } = await sessionRes.initSession({ ...params, agentId });

  state.http = http;
  state.sessionId = session_id;
  state.agentId = agentId;
  state.masking = params.maskingFunction;
  state.prompt = new PromptResource(http, agentId);

  // Telemetry
  const providers = (params.providers ?? []) as ProviderType[];
  const exportMode = (process.env.LUCIDIC_EXPORT_MODE ?? '').toLowerCase();
  const defaultUseSimple = exportMode === 'simple' || exportMode === 'simple_span_processor' || exportMode === 'simpleprocessor';
  const provider = await buildTelemetry({
    providers,
    useSpanProcessor: params.useSpanProcessor ?? defaultUseSimple,
    baseUrl: params.baseUrl,
    apiKey,
    agentId,
    instrumentModules: params.instrumentModules,
  });
  state.provider = provider;
  info('Telemetry wired (non-global provider).');

  // Auto-end on exit/signals
  const autoEnd = params.autoEnd ?? (process.env.LUCIDIC_AUTO_END ?? 'True').toLowerCase() === 'true';
  if (autoEnd) {
    const handler = async () => {
      if (state.isShuttingDown) return;
      state.isShuttingDown = true;
      try {
        info('Auto-ending session on shutdown...');
        await import('./session.js').then(m => m.endSession({}));
        // Ensure any batched spans are exported before process exits
        if (state.provider) {
          try { await state.provider.forceFlush(); } catch (e) { debug('forceFlush error', e); }
          try { await state.provider.shutdown(); } catch (e) { debug('provider shutdown error', e); }
        }
      } catch (e) {
        debug('Auto-end error', e);
      }
    };
    // Use beforeExit so async endSession can run
    process.on('beforeExit', () => { void handler(); });
    // For signals, await then exit
    process.on('SIGINT', () => { handler().finally(() => process.exit(0)); });
    process.on('SIGTERM', () => { handler().finally(() => process.exit(0)); });
  }

  // Always flush on process exit, even when autoEnd is disabled
  // 1) beforeExit: best-effort flush (no shutdown, process may continue scheduling work)
  process.on('beforeExit', async () => {
    if (state.provider) {
      try { await state.provider.forceFlush(); } catch (e) { debug('forceFlush error (beforeExit)', e); }
    }
  });

  // 2) On signals: if autoEnd didn't run, flush and shutdown before exiting
  const flushAndExit = async () => {
    if (state.isShuttingDown) return;
    state.isShuttingDown = true;
    try {
      if (state.provider) {
        try { await state.provider.forceFlush(); } catch (e) { debug('forceFlush error (signal)', e); }
        try { await state.provider.shutdown(); } catch (e) { debug('provider shutdown error (signal)', e); }
      }
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGINT', () => { if (!autoEnd) { void flushAndExit(); } });
  process.on('SIGTERM', () => { if (!autoEnd) { void flushAndExit(); } });

  return session_id;
}

export function getSessionId(): string | null { return state.sessionId; }
export function getHttp(): HttpClient {
  if (!state.http) throw new Error('Lucidic SDK not initialized');
  return state.http;
}
export function getAgentId(): string { if (!state.agentId) throw new Error('Lucidic SDK not initialized'); return state.agentId; }
export function getMask(): ((text: string)=>string)|undefined { return state.masking; }
export function getPromptResource(): PromptResource {
  if (!state.prompt) throw new Error('Lucidic SDK not initialized');
  return state.prompt;
}

// Return an OTel tracer from our local provider when available; fallback to global tracer
export function getLucidicTracer(name: string = 'ai', version?: string) {
  if (state.provider) return state.provider.getTracer(name, version);
  return trace.getTracer(name, version);
}

// Convenience: default AI SDK telemetry payload that routes spans to Lucidic
export function aiTelemetry() {
  return {
    isEnabled: true,
    tracer: getLucidicTracer('ai'),
    recordInputs: true,
    recordOutputs: true,
  } as any;
}

