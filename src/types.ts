export interface LucidicConfig {
  apiKey?: string;
  sessionName?: string;
  sessionId?: string;
  task?: string;
  agentId?: string;
  userId?: string;
  groupId?: string;
  testId?: string;
  providers?: string[];
  autoInstrument?: boolean;
  maskingFunction?: (text: string) => string;
  apiUrl?: string;
  debug?: boolean;
  autoEnd?: boolean;
}

export interface SessionConfig {
  sessionName?: string;
  sessionId?: string;
  task?: string;
  agentId?: string;
  userId?: string;
  groupId?: string;
  testId?: string;
  tags?: string[];
  massSimId?: string;
  rubrics?: string[];
  productionMonitoring?: boolean;
}

export interface StepConfig {
  state?: string;
  action?: string;
  goal?: string;
  stepId?: string;
  evalScore?: number;
  evalDescription?: string;
}

// Named parameters interfaces for function calls
export interface CreateStepParams {
  state?: string;
  action?: string;
  goal?: string;
  evalScore?: number;
  evalDescription?: string;
}

export interface EndStepParams {
  stepId?: string;
  state?: string;
  action?: string;
  goal?: string;
  evalScore?: number;
  evalDescription?: string;
}

export interface EventConfig {
  description?: string;
  result?: string;
  model?: string;
  screenshots?: string[];
  isFinished?: boolean;
  isSuccessful?: boolean;
  costAdded?: number;
  stepId?: string;
  eventId?: string;
}

// Named parameters interfaces for event functions
export interface CreateEventParams {
  stepId?: string;
  description?: string;
  result?: string;
  costAdded?: number;
  model?: string;
  screenshots?: string[];
}

export interface UpdateEventParams {
  eventId?: string;
  description?: string;
  result?: string;
  costAdded?: number;
  model?: string;
  screenshots?: string[];
}

export interface GetPromptParams {
  name: string;
  variables?: Record<string, any>;
  cache?: number;
  label?: string;
}

export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface SessionResponse {
  session_id: string;
  agent_id?: string;
  user_id?: string;
  group_id?: string;
}

export interface StepResponse {
  step_id: string;
}

export interface EventResponse {
  event_id: string;
}

export interface PromptResponse {
  prompt_content: string;
  version?: string;
}

export interface MassSimulationConfig {
  sessionBaseName: string;
  numSessions: number;
  sessionFunction: () => Promise<void>;
}

export interface ImageUploadResponse {
  image_url: string;
}

// Model pricing types
export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface ModelPricing {
  input: number;
  output: number;
}