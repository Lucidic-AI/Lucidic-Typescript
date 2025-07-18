import { TokenUsage, ModelPricing } from '../types';

// Pricing per 1M tokens
const MODEL_COSTS: Record<string, ModelPricing> = {
  // OpenAI models
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-2024-11-20': { input: 2.5, output: 10 },
  'gpt-4o-2024-08-06': { input: 2.5, output: 10 },
  'gpt-4o-2024-05-13': { input: 5, output: 15 },
  'gpt-4o-audio-preview': { input: 2.5, output: 10 },
  'gpt-4o-audio-preview-2024-10-01': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4o-mini-2024-07-18': { input: 0.15, output: 0.6 },
  'gpt-4-turbo': { input: 10, output: 30 },
  'gpt-4-turbo-2024-04-09': { input: 10, output: 30 },
  'gpt-4': { input: 30, output: 60 },
  'gpt-4-32k': { input: 60, output: 120 },
  'gpt-3.5-turbo-0125': { input: 0.5, output: 1.5 },
  'gpt-3.5-turbo': { input: 3, output: 6 },
  'gpt-3.5-turbo-1106': { input: 1, output: 2 },
  'gpt-3.5-turbo-instruct': { input: 1.5, output: 2 },
  'o1-preview': { input: 15, output: 60 },
  'o1-preview-2024-09-12': { input: 15, output: 60 },
  'o1-mini': { input: 3, output: 12 },
  'o1-mini-2024-09-12': { input: 3, output: 12 },
  'o3-mini': { input: 1.1, output: 4.4 },
  'o3-mini-2025-01-31': { input: 1.1, output: 4.4 },
  'text-embedding-ada-002': { input: 0.1, output: 0 },
  'text-embedding-3-small': { input: 0.02, output: 0 },
  'text-embedding-3-large': { input: 0.13, output: 0 },

  // Anthropic models
  'claude-3-5-sonnet-20241022': { input: 3, output: 15 },
  'claude-3-5-sonnet-20240620': { input: 3, output: 15 },
  'claude-3-5-haiku-20241022': { input: 1, output: 5 },
  'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },
  'claude-3-opus-20240229': { input: 15, output: 75 },
  'claude-3-sonnet-20240229': { input: 3, output: 15 },
  'claude-2.1': { input: 8, output: 24 },
  'claude-2.0': { input: 8, output: 24 },
  'claude-instant-1.2': { input: 0.8, output: 2.4 },

  // Claude 4 models
  'claude-opus-4-20250514': { input: 15, output: 75 },
  'claude-sonnet-4-20250514': { input: 3, output: 15 },
  'claude-haiku-4-20250514': { input: 0.25, output: 1.25 },

  // Google models
  'gemini-1.5-pro': { input: 1.25, output: 5 },
  'gemini-1.5-pro-002': { input: 1.25, output: 5 },
  'gemini-1.5-flash': { input: 0.075, output: 0.3 },
  'gemini-1.5-flash-002': { input: 0.075, output: 0.3 },
  'gemini-1.0-pro': { input: 0.5, output: 1.5 },
  'gemini-2.0-flash-exp': { input: 0, output: 0 }, // Free during experimental phase
  'gemini-exp-1206': { input: 0, output: 0 },
  'gemini-2.0-flash-thinking-exp': { input: 0, output: 0 },
  'gemini-2.0-flash-thinking-exp-1219': { input: 0, output: 0 }
};

/**
 * Calculate the cost for a model based on token usage
 * @param model The model name
 * @param usage Token usage information
 * @returns Cost in dollars or null if model pricing not found
 */
export function calculateCost(model: string, usage: TokenUsage): number | null {
  const pricing = MODEL_COSTS[model];
  if (!pricing) {
    return null;
  }

  const inputCost = (usage.prompt_tokens / 1_000_000) * pricing.input;
  const outputCost = (usage.completion_tokens / 1_000_000) * pricing.output;
  
  return inputCost + outputCost;
}