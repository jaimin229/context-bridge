/**
 * Approximate token estimation.
 *
 * Heuristic: tokens ≈ characters ÷ 4 (a commonly used rough estimate for
 * English-heavy prose in cl100k-style tokenizers). This is explicitly an
 * approximation — it is labeled "Approx. tokens" in the UI and must never be
 * presented as tokenizer-accurate.
 */
export const DEFAULT_TOKEN_BUDGET = 8000;

export function estimateTokens(text: string): number {
  if (text.length === 0) {
    return 0;
  }
  return Math.ceil(text.length / 4);
}
