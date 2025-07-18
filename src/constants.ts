// API Configuration
export const API_BASE_URL = 'https://analytics.lucidic.ai/api';
export const API_TIMEOUT = 30000; // 30 seconds
export const MAX_RETRIES = 3;
export const RETRY_DELAY = 1000; // 1 second

// Logging
export const DEBUG = process.env.LUCIDIC_DEBUG === 'True';

// Event Types
export enum EventType {
  LLM_CALL = 'llm_call',
  FUNCTION_CALL = 'function_call',
  CUSTOM = 'custom'
}

// Step States
export enum StepState {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

// Provider Types
export enum ProviderType {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  PYDANTIC_AI = 'pydantic_ai',
  OPENAI_AGENTS = 'openai_agents'
}

// OpenTelemetry Semantic Conventions
export const SPAN_ATTRIBUTES = {
  LLM_REQUEST_MODEL: 'gen_ai.request.model',
  LLM_RESPONSE_MODEL: 'gen_ai.response.model',
  LLM_REQUEST_MAX_TOKENS: 'gen_ai.request.max_tokens',
  LLM_REQUEST_TEMPERATURE: 'gen_ai.request.temperature',
  LLM_USAGE_PROMPT_TOKENS: 'gen_ai.usage.prompt_tokens',
  LLM_USAGE_COMPLETION_TOKENS: 'gen_ai.usage.completion_tokens',
  LLM_IS_STREAMING: 'llm.is_streaming',
  LLM_PROMPTS: 'llm.prompts',
  LLM_COMPLETIONS: 'llm.completions',
  GEN_AI_PROMPT: 'gen_ai.prompt',
  GEN_AI_COMPLETION: 'gen_ai.completion',
  GEN_AI_SYSTEM: 'gen_ai.system',
  GEN_AI_TOOL_NAME: 'gen_ai.tool.name',
  LUCIDIC_STEP_ID: 'lucidic.step_id'
};