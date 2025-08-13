// Prices are per 1M tokens.
type Pricing = { input: number; output: number };

const MODEL_PRICING: Record<string, Pricing> = {

  // OpenAI GPT-5 Series
  'gpt-5': { input: 1.25, output: 10.0 },
  'gpt-5-mini': { input: 0.25, output: 2.0 },
  'gpt-5-nano': { input: 0.05, output: 0.4 },

  // OpenAI GPT-4o Series
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4o-realtime-preview': { input: 5.0, output: 20.0 },
  'gpt-4o-audio-preview': { input: 100.0, output: 200.0 },

  // OpenAI GPT-4.1 Series
  'gpt-4.1': { input: 2.0, output: 8.0 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
  'gpt-4.1-nano': { input: 0.1, output: 0.4 },

  // OpenAI GPT-4 Series
  'gpt-4': { input: 30.0, output: 60.0 },
  'gpt-4-turbo': { input: 10.0, output: 30.0 },
  'gpt-4-turbo-preview': { input: 10.0, output: 30.0 },
  'gpt-4-vision-preview': { input: 10.0, output: 30.0 },
  'gpt-4-32k': { input: 60.0, output: 120.0 },

  // OpenAI GPT-3.5 Series
  'gpt-3.5-turbo': { input: 0.5, output: 1.5 },
  'gpt-3.5-turbo-16k': { input: 3.0, output: 4.0 },
  'gpt-3.5-turbo-instruct': { input: 1.5, output: 2.0 },

  // OpenAI o-Series
  'o1': { input: 15.0, output: 60.0 },
  'o1-preview': { input: 15.0, output: 60.0 },
  'o1-mini': { input: 3.0, output: 15.0 },
  'o3': { input: 15.0, output: 60.0 },
  'o3-mini': { input: 1.1, output: 4.4 },
  'o4-mini': { input: 4.0, output: 16.0 },

  // Claude 4 / 3.5 / 3.7
  'claude-4-opus': { input: 15.0, output: 75.0 },
  'claude-opus-4': { input: 15.0, output: 75.0 },
  'claude-4-sonnet': { input: 3.0, output: 15.0 },
  'claude-sonnet-4': { input: 3.0, output: 15.0 },
  'claude-3-5-sonnet': { input: 3.0, output: 15.0 },
  'claude-3-5-sonnet-latest': { input: 3.0, output: 15.0 },
  'claude-3-5-haiku': { input: 1.0, output: 5.0 },
  'claude-3-5-haiku-latest': { input: 1.0, output: 5.0 },
  'claude-3-7-sonnet': { input: 3.0, output: 15.0 },
  'claude-3-7-sonnet-latest': { input: 3.0, output: 15.0 },

  // Google Gemini (subset)
  'gemini-2.5-pro': { input: 1.25, output: 10.0 },
  'gemini-2.5-pro-preview': { input: 1.25, output: 10.0 },
  'gemini-2.5-flash': { input: 0.15, output: 0.6 },
  'gemini-2.5-flash-preview': { input: 0.15, output: 0.6 },
  'gemini-1.5-pro': { input: 1.25, output: 5.0 },
  'gemini-1.5-pro-preview': { input: 1.25, output: 5.0 },
  'gemini-1.5-flash': { input: 0.075, output: 0.3 },
  'gemini-1.5-flash-8b': { input: 0.0375, output: 0.15 },
  'gemini-pro': { input: 0.5, output: 1.5 },
  'gemini-pro-vision': { input: 0.25, output: 0.5 },
  'gemini-1.0-pro': { input: 0.5, output: 1.5 },
};

const PROVIDER_AVERAGES: Record<string, Pricing> = {
  'openai': { input: 2.5, output: 10.0 },
  'anthropic': { input: 3.0, output: 15.0 },
};

function normalizeModelName(model: string): string {
  let m = model.toLowerCase();
  // strip provider prefixes "provider/"
  m = m.replace(/^[^/]+\//, '');
  // strip date suffixes -YYYYMMDD or -YYYY-MM-DD
  m = m.replace(/-\d{8}$|_\d{8}$|-\d{4}-\d{2}-\d{2}$/, '');
  return m;
}

function getProviderFromModel(model: string): string {
  const m = model.toLowerCase();
  if (m.includes('claude') || m.includes('anthropic')) return 'anthropic';
  if (m.includes('gpt') || m.includes('openai') || m.startsWith('o')) return 'openai';
  return 'openai';
}

export function calculateCostUSD(model: string, attrs: Record<string, any>): number | null {
  const promptTokens = attrs['gen_ai.usage.prompt_tokens'] ?? attrs['gen_ai.usage.input_tokens'] ?? 0;
  const completionTokens = attrs['gen_ai.usage.completion_tokens'] ?? attrs['gen_ai.usage.output_tokens'] ?? 0;
  const total = Number(promptTokens) + Number(completionTokens);
  if (!total) return null;
  const normalized = normalizeModelName(model);
  const pricing = MODEL_PRICING[normalized] ||
    MODEL_PRICING[Object.keys(MODEL_PRICING).find(k => normalized.startsWith(k)) as string ?? ''] ||
    PROVIDER_AVERAGES[getProviderFromModel(model)];
  const cost = ((Number(promptTokens) * pricing.input) + (Number(completionTokens) * pricing.output)) / 1_000_000;
  return cost;
}

