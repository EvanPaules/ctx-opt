/**
 * Per-model input pricing in USD per 1M tokens. Output pricing is not
 * tracked because ctx-opt only affects input size.
 *
 * These defaults are best-effort snapshots and can shift with provider
 * price changes. Pass `pricing` in `OptimizerConfig` to override.
 */
export interface ModelPricing {
  /** USD per 1M input tokens. */
  inputUsdPerMillion: number;
}

export const DEFAULT_PRICING: Record<string, ModelPricing> = {
  // OpenAI
  'gpt-4o': { inputUsdPerMillion: 2.5 },
  'gpt-4o-mini': { inputUsdPerMillion: 0.15 },
  'gpt-4-turbo': { inputUsdPerMillion: 10 },
  'gpt-4': { inputUsdPerMillion: 30 },
  'gpt-3.5-turbo': { inputUsdPerMillion: 0.5 },
  'o1': { inputUsdPerMillion: 15 },
  'o1-mini': { inputUsdPerMillion: 3 },
  'o3-mini': { inputUsdPerMillion: 1.1 },

  // Anthropic
  'claude-opus-4-7': { inputUsdPerMillion: 15 },
  'claude-opus-4-5': { inputUsdPerMillion: 15 },
  'claude-sonnet-4-6': { inputUsdPerMillion: 3 },
  'claude-sonnet-4-5': { inputUsdPerMillion: 3 },
  'claude-haiku-4-5': { inputUsdPerMillion: 0.8 },
  'claude-haiku-4-5-20251001': { inputUsdPerMillion: 0.8 },
  'claude-3-5-sonnet-20241022': { inputUsdPerMillion: 3 },
  'claude-3-5-haiku-20241022': { inputUsdPerMillion: 0.8 },

  // Google
  'gemini-2.0-flash': { inputUsdPerMillion: 0.075 },
  'gemini-1.5-pro': { inputUsdPerMillion: 1.25 },
  'gemini-1.5-flash': { inputUsdPerMillion: 0.075 },
};

export function resolvePricing(
  model: string | undefined,
  override: Record<string, ModelPricing> | undefined
): ModelPricing | undefined {
  if (!model) return undefined;
  if (override && model in override) return override[model];
  if (model in DEFAULT_PRICING) return DEFAULT_PRICING[model];
  // Best-effort prefix match for versioned model IDs.
  const lower = model.toLowerCase();
  const table = override ?? DEFAULT_PRICING;
  for (const key of Object.keys(table)) {
    if (lower.startsWith(key.toLowerCase())) return table[key];
  }
  return undefined;
}

export function tokensToUsd(tokens: number, pricing: ModelPricing): number {
  return (tokens * pricing.inputUsdPerMillion) / 1_000_000;
}
