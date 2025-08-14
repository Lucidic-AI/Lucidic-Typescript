// Prices are per 1M tokens.
type Pricing = { input: number; output: number};

const MODEL_PRICING: Record<string, Pricing> = {

  // OpenAI GPT-5 Series
  'gpt-5': { input: 1.25, output: 10.0 },
  'gpt-5-mini': { input: 0.25, output: 2.0 },
  'gpt-5-nano': { input: 0.05, output: 0.4 },
  'gpt-5-chat-latest': { input: 1.25, output: 10.0 },

  // OpenAI GPT-4o Series
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gpt-4o-2024-05-13': { input: 5.0, output: 15.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4o-mini-audio-preview': { input: 0.15, output: 0.6 },
  'gpt-4o-mini-realtime-preview': { input: 0.60, output: 2.40 },
  'gpt-4o-realtime-preview': { input: 5.0, output: 20.0 },
  'gpt-4o-audio-preview': { input: 2.5, output: 10.0 },
  'gpt-4o-mini-search-preview': { input: 0.15, output: 0.6 },
  'gpt-4o-search-preview': { input: 2.5, output: 10.0 },

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
  'o1-pro': { input: 150.0, output: 600.0 },
  'o1-preview': { input: 15.0, output: 60.0 },
  'o1-mini': { input: 1.10, output: 4.40 },
  'o3-pro': { input: 20.0, output: 80.0 },
  'o3': { input: 2.0, output: 8.0 },
  'o3-deep-research': { input: 10.0, output: 40.0 },
  'o3-mini': { input: 1.10, output: 4.40 },
  'o4-mini': { input: 1.10, output: 4.40 },
  'o4-mini-deep-research': { input: 2.0, output: 8.0 },

  // OpenAI other previews
  'computer-use-preview': { input: 3.0, output: 12.0 },
  'codex-mini-latest': { input: 1.50, output: 6.0 },
  'gpt-image-1': { input: 5.0, output: 0.0},

  // Claude 4 / 3.5 / 3.7
  'claude-opus-4-1': { input: 15.0, output: 75.0 },
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
  'claude-3-opus': { input: 15.0, output: 75.0 },
  'claude-3-sonnet': { input: 3.0, output: 15.0 },
  'claude-3-haiku': { input: 0.25, output: 1.25 },
  'claude-2': { input: 8.0, output: 24.0 },
  'claude-2.1': { input: 8.0, output: 24.0 },
  'claude-2.0': { input: 8.0, output: 24.0 },
  'claude-instant': { input: 0.8, output: 2.4 },
  'claude-instant-1': { input: 0.8, output: 2.4 },
  'claude-instant-1.2': { input: 0.8, output: 2.4 },

  // Google Gemini 2.5 / 2.0 / 1.5 / 1.0
  'gemini-2.5-pro': { input: 1.25, output: 10.0 },
  'gemini-2.5-pro-preview': { input: 1.25, output: 10.0 },
  'gemini-2.5-flash': { input: 0.15, output: 0.6 },
  'gemini-2.5-flash-preview': { input: 0.15, output: 0.6 },
  'gemini-2.0-flash': { input: 0.1, output: 0.4 },
  'gemini-2.0-flash-exp': { input: 0.0, output: 0.0 },
  'gemini-2.0-flash-experimental': { input: 0.0, output: 0.0 },
  'gemini-1.5-pro': { input: 1.25, output: 5.0 },
  'gemini-1.5-pro-preview': { input: 1.25, output: 5.0 },
  'gemini-1.5-flash': { input: 0.075, output: 0.3 },
  'gemini-1.5-flash-8b': { input: 0.0375, output: 0.15 },
  'gemini-pro': { input: 0.5, output: 1.5 },
  'gemini-pro-vision': { input: 0.25, output: 0.5 },
  'gemini-1.0-pro': { input: 0.5, output: 1.5 },

  // Meta Llama 4 / 3.x (Together AI pricing references)
  'llama-4-maverick-17b': { input: 0.2, output: 0.6 },
  'llama-4-scout-17b': { input: 0.11, output: 0.34 },
  'llama-guard-4-12b': { input: 0.20, output: 0.20 },
  'meta-llama/llama-4-maverick-17b-128e-instruct': { input: 0.2, output: 0.6 },
  'meta-llama/llama-4-scout-17b-16e-instruct': { input: 0.11, output: 0.34 },
  'meta-llama/llama-guard-4-12b-128k': { input: 0.20, output: 0.20 },
  'llama-3.3-70b': { input: 0.54, output: 0.88 },
  'llama-3.1-405b': { input: 6.0, output: 12.0 },
  'llama-3.1-70b': { input: 0.54, output: 0.88 },
  'llama-3.1-8b': { input: 0.10, output: 0.18 },
  'llama-3-70b': { input: 0.54, output: 0.88 },
  'llama-3-8b': { input: 0.10, output: 0.18 },
  'llama-guard-3-8b': { input: 0.20, output: 0.20 },
  'meta-llama/llama-3.3-70b-versatile-128k': { input: 0.54, output: 0.88 },
  'meta-llama/llama-3.1-8b-instant-128k': { input: 0.10, output: 0.18 },
  'meta-llama/llama-3-70b-8k': { input: 0.54, output: 0.88 },
  'meta-llama/llama-3-8b-8k': { input: 0.10, output: 0.18 },
  'meta-llama/llama-guard-3-8b-8k': { input: 0.20, output: 0.20 },

  // Mistral
  'mistral-large': { input: 2.0, output: 6.0 },
  'mistral-medium': { input: 2.7, output: 8.1 },
  'mistral-small': { input: 0.1, output: 0.3 },
  'mistral-tiny': { input: 0.14, output: 0.42 },
  'mistral-7b-instruct': { input: 0.15, output: 0.15 },
  'mistral-8x7b-instruct': { input: 0.24, output: 0.24 },
  'mistral-saba-24b': { input: 0.79, output: 0.79 },
  'mistral/mistral-saba-24b': { input: 0.79, output: 0.79 },

  // Cohere
  'command': { input: 1.0, output: 2.0 },
  'command-light': { input: 0.3, output: 0.6 },
  'command-nightly': { input: 1.0, output: 2.0 },
  'command-r': { input: 0.5, output: 1.5 },
  'command-r-plus': { input: 3.0, output: 15.0 },

  // DeepSeek
  'deepseek-r1-distill-llama-70b': { input: 0.75, output: 0.99 },
  'deepseek-ai/deepseek-r1-distill-llama-70b': { input: 0.75, output: 0.99 },
  'deepseek-coder': { input: 0.14, output: 0.28 },
  'deepseek-chat': { input: 0.14, output: 0.28 },
  'deepseek/deepseek-v3-0324': { input: 0.14, output: 0.28 },

  // Qwen
  'qwen-qwq-32b': { input: 0.29, output: 0.39 },
  'qwen/qwen-qwq-32b-preview-128k': { input: 0.29, output: 0.39 },
  'qwen-turbo': { input: 0.3, output: 0.6 },
  'qwen-plus': { input: 0.5, output: 2.0 },
  'qwen-max': { input: 2.0, output: 6.0 },
  'qwen2.5-32b-instruct': { input: 0.7, output: 2.8 },
  'qwen2.5-max': { input: 1.6, output: 6.4 },

  // Gemma
  'gemma-2-9b': { input: 0.20, output: 0.20 },
  'gemma-2-27b': { input: 0.27, output: 0.27 },
  'gemma-7b-it': { input: 0.07, output: 0.07 },
  'google/gemma-2-9b-8k': { input: 0.20, output: 0.20 },

  // Together AI
  'together-ai/redpajama-incite-7b-chat': { input: 0.2, output: 0.2 },
  'together-ai/redpajama-incite-base-3b-v1': { input: 0.1, output: 0.1 },

  // Perplexity
  'pplx-7b-chat': { input: 0.07, output: 0.28 },
  'pplx-70b-chat': { input: 0.7, output: 2.8 },
  'pplx-7b-online': { input: 0.07, output: 0.28 },
  'pplx-70b-online': { input: 0.7, output: 2.8 },

  // xAI Grok
  'grok-3-latest': { input: 3, output: 15 },
  'grok-3': { input: 3, output: 15 },
  'grok-3-fast': { input: 5, output: 25 },
  'grok-3-mini': { input: 0.3, output: 0.5 },
  'grok-3-mini-fast': { input: 0.6, output: 4 },
};

const PROVIDER_AVERAGES: Record<string, Pricing> = {
  openai: { input: 2.5, output: 10.0 },
  anthropic: { input: 3.0, output: 15.0 },
  google: { input: 0.5, output: 1.5 },
  meta: { input: 0.3, output: 0.5 },
  mistral: { input: 0.5, output: 1.5 },
  cohere: { input: 1.0, output: 2.0 },
  deepseek: { input: 0.3, output: 0.5 },
  qwen: { input: 0.5, output: 1.0 },
  together: { input: 0.15, output: 0.15 },
  perplexity: { input: 0.4, output: 1.5 },
  grok: { input: 2.4, output: 12 },
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
  if (m.includes('gemini') || m.includes('google') || m.includes('palm') || m.includes('bison') || m.includes('gemma')) return 'google';
  if (m.includes('llama') || m.includes('meta')) return 'meta';
  if (m.includes('mistral')) return 'mistral';
  if (m.includes('command') || m.includes('cohere')) return 'cohere';
  if (m.includes('deepseek')) return 'deepseek';
  if (m.includes('qwen') || m.includes('qwq')) return 'qwen';
  if (m.includes('together') || m.includes('redpajama')) return 'together';
  if (m.includes('pplx') || m.includes('perplexity')) return 'perplexity';
  if (m.includes('grok') || m.includes('xai')) return 'grok';
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

