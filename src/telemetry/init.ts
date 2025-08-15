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

  // Allow instrumentations to be enabled either via providers[] or via instrumentModules escape hatch
  const modules = params.instrumentModules ?? {};
  const enableOpenAI = params.providers.includes('openai') || !!(modules as any).OpenAI || !!(modules as any).openai;
  const enableAnthropic = params.providers.includes('anthropic') || !!(modules as any).anthropic || !!(modules as any).Anthropic;
  const enableLangChain = params.providers.includes('langchain') || !!(modules as any).langchain || !!(modules as any).LangChain;

  const openaiInstr = enableOpenAI ? new OpenAIInstrumentation({ traceContent: true }) : null;
  const anthrInstr = enableAnthropic ? new AnthropicInstrumentation({ traceContent: true }) : null;
  const lcInstr = enableLangChain ? new LangChainInstrumentation({ traceContent: true }) : null;

  const instrumentations = [openaiInstr, anthrInstr, lcInstr].filter(Boolean) as any[];
  registerInstrumentations({ instrumentations, tracerProvider: provider });
  info(`Registered ${instrumentations.length} instrumentations`);

  // Manual instrumentation escape hatch (ESM/Next.js quirks)
  if (params.instrumentModules) {
    try {
      if (openaiInstr && ((params.instrumentModules as any).OpenAI || (params.instrumentModules as any).openai)) {
        debug('Manually instrumenting OpenAI module');
        const mod = (params.instrumentModules as any).OpenAI ?? (params.instrumentModules as any).openai;
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

