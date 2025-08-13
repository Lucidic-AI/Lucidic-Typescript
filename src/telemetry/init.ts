import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { context, diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { BatchSpanProcessor, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { OpenAIInstrumentation } from '@traceloop/instrumentation-openai';
import { AnthropicInstrumentation } from '@traceloop/instrumentation-anthropic';
import { LangChainInstrumentation } from '@traceloop/instrumentation-langchain';
import { LucidicSpanExporter } from './exporter';
import { debug, info } from '../util/logger';

type BuildTelemetryParams = {
  providers: Array<'openai'|'anthropic'|'langchain'>;
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

  provider.addSpanProcessor(processor);

  const openaiInstr = params.providers.includes('openai') ? new OpenAIInstrumentation({ traceContent: true }) : null;
  const anthrInstr = params.providers.includes('anthropic') ? new AnthropicInstrumentation({ traceContent: true }) : null;
  const lcInstr = params.providers.includes('langchain') ? new LangChainInstrumentation({ traceContent: true }) : null;

  const instrumentations = [openaiInstr, anthrInstr, lcInstr].filter(Boolean) as any[];
  registerInstrumentations({ instrumentations, tracerProvider: provider });
  info(`Registered ${instrumentations.length} instrumentations`);

  // Manual instrumentation escape hatch (ESM/Next.js quirks)
  if (params.instrumentModules) {
    try {
      if (openaiInstr && (params.instrumentModules as any).OpenAI) {
        debug('Manually instrumenting OpenAI module');
        (openaiInstr as any).manuallyInstrument((params.instrumentModules as any).OpenAI);
      }
      if (anthrInstr && (params.instrumentModules as any).anthropic) {
        debug('Manually instrumenting Anthropic module');
        (anthrInstr as any).manuallyInstrument((params.instrumentModules as any).anthropic);
      }
      if (lcInstr && (params.instrumentModules as any).langchain) {
        debug('Manually instrumenting LangChain modules');
        (lcInstr as any).manuallyInstrument((params.instrumentModules as any).langchain);
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

