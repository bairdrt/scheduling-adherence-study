/**
 * THE ONE SEAM EVERY ADAPTER FILLS (design section 9): a prompt and a system line in, the text and the accounting out.
 * Every provider's adapter (models/anthropic.ts, openai.ts, gemini.ts) has exactly this signature, so the conditions
 * never know which provider they are talking to.
 */
export interface ModelCall {
  text: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /** The model the provider says answered (its own id string). */
  model: string;
  latencyMs: number;
  stopReason: string | null;
  costUsd: number;
}

export interface ModelOpts { model: string }

export type ModelFn = (prompt: string, system: string, opts: ModelOpts) => Promise<ModelCall>;

/** USD per million tokens; `cachedIn` absent means cached input is billed as `in * cacheReadRate`. */
export interface Price { in: number; out: number; cachedIn?: number; cacheWrite?: number }
