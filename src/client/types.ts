export type ProviderType =
  | 'openai'
  | 'azureopenai'
  | 'anthropic'
  | 'langchain'
  | 'vertexai'
  | 'bedrock'
  | 'cohere';

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type InitParams = {
  sessionName?: string;
  sessionId?: string;
  apiKey?: string;
  agentId?: string;
  task?: string;
  providers?: ProviderType[];
  productionMonitoring?: boolean;
  massSimId?: string;
  experimentId?: string;
  rubrics?: string[];
  tags?: string[];
  maskingFunction?: (text: string) => string;
  autoEnd?: boolean;
  // capture uncaught exceptions and create a crash event (default: true)
  captureUncaught?: boolean;
  // optional escape hatch for manual module instrumentation (Next.js-like)
  instrumentModules?: Record<string, any>;
  // telemetry options
  useSpanProcessor?: boolean;
  baseUrl?: string;
  debug?: boolean;
};

export type UpdateSessionParams = {
  task?: string;
  sessionEval?: number;
  sessionEvalReason?: string;
  isSuccessful?: boolean;
  isSuccessfulReason?: string;
  tags?: string[];
};

export type GetPromptParams = {
  promptName: string;
  variables?: Record<string, any>;
  cacheTtl?: number; // seconds; -1 cache forever; 0 disable cache
  label?: string;
};

// New typed event model
export type EventType = 'llm_generation' | 'function_call' | 'error_traceback' | 'generic';

export interface LLMGenerationPayload {
  request: {
    provider: string;
    model: string;
    params?: Record<string, any>;
    messages?: Array<{
      role: string;
      content: string;
      name?: string;
      tool_call_id?: string;
    }>;
  };
  response: {
    output?: string | JsonValue;
    messages?: Array<{ role: string; content: string }>;
    tool_calls?: Array<{
      id: string;
      type: string;
      name: string;
      arguments: JsonValue;
    }>;
    thinking?: string[];
    raw?: JsonValue;
  };
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache?: string;
    cost?: number;
  };
  status?: string;
  error?: string;
  misc?: Record<string, any>;
}

export interface FunctionCallPayload {
  function_name: string;
  arguments?: JsonValue;
  return_value?: JsonValue;
  misc?: Record<string, any>;
}

export interface ErrorTracebackPayload {
  error: string;
  traceback?: string;
  misc?: Record<string, any>;
}

export interface GenericEventPayload {
  details?: string;
  misc?: Record<string, any>;
}

export interface BaseEventParams {
  eventId?: string;
  parentEventId?: string;
  occurredAt?: string;
  duration?: number;
  tags?: string[];
  metadata?: Record<string, any>;
  screenshots?: string[];
}

export interface LLMGenerationEventParams extends BaseEventParams {
  type: 'llm_generation';
  payload: LLMGenerationPayload;
}

export interface FunctionCallEventParams extends BaseEventParams {
  type: 'function_call';
  payload: FunctionCallPayload;
}

export interface ErrorTracebackEventParams extends BaseEventParams {
  type: 'error_traceback';
  payload: ErrorTracebackPayload;
}

export interface GenericEventParams extends BaseEventParams {
  type?: 'generic';
  payload?: GenericEventPayload;
}

export type EventParams =
  | LLMGenerationEventParams
  | FunctionCallEventParams
  | ErrorTracebackEventParams
  | GenericEventParams;

