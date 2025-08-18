export type ProviderType = 'openai' | 'anthropic' | 'langchain';

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

export type StepParams = {
  stepId?: string;
  state?: string;
  action?: string;
  goal?: string;
  evalScore?: number;
  evalDescription?: string;
  screenshot?: string; // base64 data URL or raw base64
  screenshotPath?: string; // filesystem path
};

export type EventParams = {
  eventId?: string;
  stepId?: string;
  description?: string;
  result?: string;
  costAdded?: number;
  duration?: number;
  model?: string;
  screenshots?: string[]; // base64 data URLs
  // function metadata
  functionName?: string;
  arguments?: JsonValue; // valid JSON only
};

export type GetPromptParams = {
  promptName: string;
  variables?: Record<string, any>;
  cacheTtl?: number; // seconds; -1 cache forever; 0 disable cache
  label?: string;
};

