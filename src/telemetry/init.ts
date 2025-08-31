import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { context, diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { BatchSpanProcessor, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { OpenAIInstrumentation } from '@traceloop/instrumentation-openai';
import { AnthropicInstrumentation } from '@traceloop/instrumentation-anthropic';
import { LangChainInstrumentation } from '@traceloop/instrumentation-langchain';
import { VertexAIInstrumentation } from '@traceloop/instrumentation-vertexai';
import { BedrockInstrumentation } from '@traceloop/instrumentation-bedrock';
import { CohereInstrumentation } from '@traceloop/instrumentation-cohere';
import { LucidicSpanExporter } from './exporter';
import { debug, info } from '../util/logger';
import type { ProviderType } from '../client/types';

// Guard: global tracer provider should be registered at most once per process
let didRegisterGlobalProvider = false;

type BuildTelemetryParams = {
  providers: ProviderType[];
  useSpanProcessor: boolean;
  baseUrl?: string;
  apiKey: string;
  agentId: string;
  instrumentModules?: Record<string, any>;
};

export async function buildTelemetry(params: BuildTelemetryParams) {
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.ERROR);

  // Context manager only if none exists
  try {
    // @ts-ignore internal
    const hasManager = (context as any)._getContextManager?.() != null;
    if (!hasManager) {
      const cm = new AsyncLocalStorageContextManager();
      cm.enable();
      context.setGlobalContextManager(cm);
      debug('Set global AsyncLocalStorageContextManager');
    }
  } catch {}

  const provider = new NodeTracerProvider();

  const exporter = new LucidicSpanExporter({ baseUrl: params.baseUrl, apiKey: params.apiKey, agentId: params.agentId });
  const processor = params.useSpanProcessor
    ? new SimpleSpanProcessor(exporter)
    : new BatchSpanProcessor(exporter);
  debug('Span processor created', { mode: params.useSpanProcessor ? 'simple' : 'batch' });

  // Add context capture processor FIRST (runs synchronously at span creation)
  // This captures BOTH session_id and parent_event_id from context
  try {
    const { ContextCaptureProcessor } = await import('./contextCaptureProcessor.js');
    provider.addSpanProcessor(new ContextCaptureProcessor());
    debug('ContextCaptureProcessor added');
  } catch (e) {
    debug('Unable to add ContextCaptureProcessor', e);
  }

  // Add the export processor (batch or simple)
  provider.addSpanProcessor(processor);

  // Register provider as global to ensure any instrumentation that relies on the global API uses our provider -- guarded
  try {
    if (!didRegisterGlobalProvider) {
      provider.register();
      didRegisterGlobalProvider = true;
      debug('Tracer provider registered as global');
    } else {
      debug('Tracer provider already registered as global; skipping');
    }
  } catch (e) {
    debug('Error registering tracer provider as global', e);
  }

  // Allow instrumentations to be enabled either via providers[] or via instrumentModules escape hatch
  const modules = params.instrumentModules ?? {};
  const enableOpenAI = params.providers.includes('openai') || params.providers.includes('azureopenai') || !!(modules as any).OpenAI || !!(modules as any).openai || !!(modules as any).AzureOpenAI;
  const enableAnthropic = params.providers.includes('anthropic') || !!(modules as any).anthropic || !!(modules as any).Anthropic;
  const enableLangChain = params.providers.includes('langchain') || !!(modules as any).langchain || !!(modules as any).LangChain;
  const enableVertexAI = (params.providers as ProviderType[]).includes('vertexai') || !!(modules as any).vertexai || !!(modules as any).VertexAI || !!(modules as any)['@google-cloud/vertexai'];
  const enableBedrock = params.providers.includes('bedrock') || !!(modules as any).bedrock || !!(modules as any).Bedrock;
  const enableCohere = params.providers.includes('cohere') || !!(modules as any).cohere || !!(modules as any).Cohere;

  const openaiInstr = enableOpenAI ? new OpenAIInstrumentation({ traceContent: true }) : null;
  const anthrInstr = enableAnthropic ? new AnthropicInstrumentation({ traceContent: true }) : null;
  const lcInstr = enableLangChain ? new LangChainInstrumentation({ traceContent: true }) : null;
  const vertexInstr = enableVertexAI ? new VertexAIInstrumentation({ traceContent: true }) : null;
  const bedrockInstr = enableBedrock ? new BedrockInstrumentation({ traceContent: true }) : null;
  const cohereInstr = enableCohere ? new CohereInstrumentation({ traceContent: true }) : null;

  const instrumentations = [openaiInstr, anthrInstr, lcInstr, vertexInstr, bedrockInstr, cohereInstr].filter(Boolean) as any[];
  registerInstrumentations({ instrumentations, tracerProvider: provider });
  info(`Registered ${instrumentations.length} instrumentations`);

  // Manual instrumentation escape hatch (ESM/Next.js quirks)
  if (params.instrumentModules) {
    try {
      if (openaiInstr && ((params.instrumentModules as any).OpenAI || (params.instrumentModules as any).openai || (params.instrumentModules as any).AzureOpenAI)) {
        debug('Manually instrumenting OpenAI module');
        const mod = (params.instrumentModules as any).OpenAI ?? (params.instrumentModules as any).openai ?? (params.instrumentModules as any).AzureOpenAI;
        (openaiInstr as any).manuallyInstrument(mod);
      }
      if (anthrInstr && ((params.instrumentModules as any).anthropic || (params.instrumentModules as any).Anthropic)) {
        debug('Manually instrumenting Anthropic module');
        const mod = (params.instrumentModules as any).anthropic ?? (params.instrumentModules as any).Anthropic;
        (anthrInstr as any).manuallyInstrument(mod);
      }
      if (lcInstr && ((params.instrumentModules as any).langchain || (params.instrumentModules as any).LangChain)) {
        debug('Manually instrumenting LangChain modules');
        const mod = (params.instrumentModules as any).langchain ?? (params.instrumentModules as any).LangChain;
        (lcInstr as any).manuallyInstrument(mod);
      }
      if (vertexInstr && ((params.instrumentModules as any).vertexai || (params.instrumentModules as any).VertexAI || (params.instrumentModules as any)['@google-cloud/vertexai'])) {
        debug('Manually instrumenting Vertex AI module');
        const mod = (params.instrumentModules as any).vertexai ?? (params.instrumentModules as any).VertexAI ?? (params.instrumentModules as any)['@google-cloud/vertexai'];
        (vertexInstr as any).manuallyInstrument?.(mod);
      }
      if (bedrockInstr && ((params.instrumentModules as any).bedrock || (params.instrumentModules as any).Bedrock)) {
        debug('Manually instrumenting Bedrock module');
        const mod = (params.instrumentModules as any).bedrock ?? (params.instrumentModules as any).Bedrock;
        (bedrockInstr as any).manuallyInstrument?.(mod);
      }
      if (cohereInstr && ((params.instrumentModules as any).cohere || (params.instrumentModules as any).Cohere)) {
        debug('Manually instrumenting Cohere module');
        const mod = (params.instrumentModules as any).cohere ?? (params.instrumentModules as any).Cohere;
        (cohereInstr as any).manuallyInstrument?.(mod);
      }
    } catch (e) {
      debug('Manual instrumentation error', e);
    }
  }

  // Optional manual instrumentation escape hatch
  if (params.instrumentModules) {
    // For now, no-op; reserved for future manual instrumentation like Laminar
  }

  return provider;
}

