import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { Resource } from '@opentelemetry/resources';
import { trace, Tracer } from '@opentelemetry/api';
import { OpenAIInstrumentation } from '@traceloop/instrumentation-openai';
import { AnthropicInstrumentation } from '@traceloop/instrumentation-anthropic';
import { Instrumentation, registerInstrumentations } from '@opentelemetry/instrumentation';
import { Client } from '../client';
import { logger } from '../utils/logger';
import { LucidicSpanProcessor } from './lucidicSpanProcessor';
import { runWithImageStorage } from './utils/imageStorage';
import { runWithTextStorage } from './utils/textStorage';
import { DEBUG } from '../constants';

export class LucidicTelemetry {
  private static instance: LucidicTelemetry;
  private initialized = false;
  private tracerProvider: NodeTracerProvider | null = null;
  private spanProcessor: LucidicSpanProcessor | null = null;
  private instrumentations: Map<string, Instrumentation> = new Map();
  private tracer: Tracer | null = null;

  private constructor() {}

  static getInstance(): LucidicTelemetry {
    if (!LucidicTelemetry.instance) {
      LucidicTelemetry.instance = new LucidicTelemetry();
    }
    return LucidicTelemetry.instance;
  }

  private clientGetter: (() => Client | null) | null = null;

  setClientGetter(getter: () => Client | null): void {
    this.clientGetter = getter;
  }

  initialize(agentId: string, serviceName: string = 'lucidic-ai'): void {
    if (this.tracerProvider) {
      if (DEBUG) {
        logger.debug('OpenTelemetry already initialized');
      }
      return;
    }

    try {
      // Create resource
      const resource = Resource.default().merge(
        new Resource({
          'service.name': serviceName,
          'service.version': '1.0.0',
          'lucidic.agent_id': agentId,
        })
      );

      // Create tracer provider
      this.tracerProvider = new NodeTracerProvider({
        resource,
      });

      // Register as global provider FIRST before adding processors
      this.tracerProvider.register();

      // Add our custom span processor for real-time event handling
      this.spanProcessor = new LucidicSpanProcessor(() => this.clientGetter ? this.clientGetter() : null);
      this.tracerProvider.addSpanProcessor(this.spanProcessor);

      // Get tracer
      this.tracer = trace.getTracer('lucidic-ai', '1.0.0');

      logger.info('[LucidicTelemetry] OpenTelemetry initialized');
      logger.info(`[LucidicTelemetry] Span processor added: ${this.spanProcessor ? 'yes' : 'no'}`);
      this.initialized = true;
    } catch (error) {
      logger.error(`Failed to initialize OpenTelemetry: ${error}`);
      throw error;
    }
  }

  instrumentProviders(providers: string[]): void {
    for (const provider of providers) {
      try {
        switch (provider) {
          case 'openai':
            if (!this.instrumentations.has(provider)) {
              this.instrumentOpenAI();
            }
            break;
          case 'anthropic':
            if (!this.instrumentations.has(provider)) {
              this.instrumentAnthropic();
            }
            break;
          case 'pydantic_ai':
            logger.info('[LucidicTelemetry] Pydantic AI will use manual instrumentation');
            break;
          case 'openai_agents':
            // OpenAI Agents uses the same OpenAI instrumentation
            if (!this.instrumentations.has('openai')) {
              this.instrumentOpenAI();
            }
            break;
          default:
            logger.warn(`Unknown provider: ${provider}`);
        }
      } catch (error) {
        logger.error(`Failed to instrument ${provider}: ${error}`);
      }
    }
  }

  private instrumentOpenAI(): void {
    try {
      // Create instrumentation with correct config
      const instrumentation = new OpenAIInstrumentation({
        enrichTokens: true,  // Fixed property name
        exceptionLogger: (e: Error) => logger.error(`OpenAI error: ${e}`),
        traceContent: true
      });
      
      // Note: OpenLLMetry TypeScript doesn't support request hooks
      // Step context is handled in the span processor

      // Register the instrumentation
      registerInstrumentations({
        instrumentations: [instrumentation],
        tracerProvider: this.tracerProvider!,
      });

      this.instrumentations.set('openai', instrumentation);
      logger.info('[LucidicTelemetry] Instrumented OpenAI');
    } catch (error) {
      logger.error(`Failed to instrument OpenAI: ${error}`);
      throw error;
    }
  }

  private instrumentAnthropic(): void {
    try {
      const instrumentation = new AnthropicInstrumentation({
        exceptionLogger: (e: Error) => logger.error(`Anthropic error: ${e}`),
        traceContent: true
      });
      
      // Note: OpenLLMetry TypeScript doesn't support request hooks
      // Step context is handled in the span processor

      // Register the instrumentation
      registerInstrumentations({
        instrumentations: [instrumentation],
        tracerProvider: this.tracerProvider!,
      });

      this.instrumentations.set('anthropic', instrumentation);
      logger.info('[LucidicTelemetry] Instrumented Anthropic');
    } catch (error) {
      logger.error(`Failed to instrument Anthropic: ${error}`);
      throw error;
    }
  }

  uninstrumentAll(): void {
    // Note: OpenTelemetry instrumentations don't have a standard uninstrument method
    // We'll clear our tracking and shutdown the provider
    this.instrumentations.clear();
    
    // Shutdown tracer provider
    if (this.tracerProvider) {
      this.tracerProvider.shutdown().then(
        () => logger.info('[LucidicTelemetry] Tracer provider shut down'),
        (error) => logger.error(`Failed to shutdown tracer provider: ${error}`)
      );
      this.tracerProvider = null;
      this.spanProcessor = null;
      this.tracer = null;
    }
    
    this.initialized = false;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  getTracer(): Tracer | null {
    return this.tracer;
  }
}