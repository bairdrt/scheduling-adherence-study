/**
 * THE ANTHROPIC ADAPTER (docs/study-design.md sections 5 and 9). One Messages API call per step, nothing else: no
 * Router, no spend meter, no retries beyond the SDK's own (2, on 408/409/429/5xx and connection errors).
 *
 * PINNED, AND RECORDED IN EVERY JSONL LINE (ADAPTER_SETTINGS):
 *   - max_tokens 16384, Winnie's own API default (src/router/anthropic-api.ts DEFAULT_MAX_TOKENS at ca6b6ee);
 *   - thinking {type: "adaptive"} and output_config.effort "high": what Sonnet 5 runs when both are omitted, which is
 *     what Winnie's API runner sends (it sets neither), stated explicitly so a default change cannot move the study;
 *   - temperature NOT SENT. The design asked for it pinned, but the API rejects `temperature` with a 400 on Sonnet 5
 *     and the 5.x family (and on every model from API version 2026-10-21; claude-api skill, 2026-11-05). Recorded as
 *     null. Repetitions differ by sampling at the API's fixed default, and the "seed" is the repetition index only:
 *     the Messages API takes no seed.
 *   - no server-side refusal fallback: a fallback would change the model under test mid-run. A refusal comes back as
 *     stopReason "refusal" with empty text, and the loop reads it as an unreadable answer.
 *
 * Model ids and prices are from the claude-api skill's model table (cached 2026-10-06), never from memory.
 * The key: ANTHROPIC_API_KEY from the environment, else var/.env, else the macOS keychain item "ai.winnie.anthropic-api"
 * (models/env.ts, the loader every adapter shares).
 */
import Anthropic from '@anthropic-ai/sdk';
import { apiKeyFor, type KeyResult } from './env.js';
import type { ModelCall, ModelFn, ModelOpts } from './types.js';

export type { ModelCall, ModelFn, ModelOpts };

export const KEYCHAIN_ITEM = 'ai.winnie.anthropic-api';

/** USD per million tokens (input, output), from the claude-api skill's table. Cache rates per Winnie's runner. */
export const PRICING: Record<string, { in: number; out: number }> = {
  'claude-sonnet-5': { in: 2, out: 10 },
  'claude-sonnet-5-5': { in: 2, out: 10 },
  'claude-opus-5': { in: 5, out: 25 },
  'claude-opus-5-5': { in: 4, out: 20 },
  'claude-haiku-5-5': { in: 0.1, out: 0.5 },
  'claude-fable-5-1': { in: 10, out: 50 },
};
export const CACHE_READ_RATE = 0.1;
export const CACHE_WRITE_RATE = 1.25;

export const ADAPTER_SETTINGS = {
  provider: 'anthropic',
  sdk: '@anthropic-ai/sdk 1.5.0',
  maxTokens: 16384,
  thinking: { type: 'adaptive' as const },
  effort: 'high' as const,
  temperature: null,
  temperatureNote: 'not sent: rejected with a 400 on claude-sonnet-5 (claude-api skill); API default sampling',
  seed: 'repetition index only; the Messages API takes no seed',
} as const;

export function costUsd(model: string, t: { inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheWriteTokens?: number }): number {
  const p = PRICING[model];
  if (!p) throw new Error(`no price for ${model}; add it from the claude-api skill's table`);
  return (t.inputTokens * p.in + (t.cacheReadTokens ?? 0) * p.in * CACHE_READ_RATE + (t.cacheWriteTokens ?? 0) * p.in * CACHE_WRITE_RATE + t.outputTokens * p.out) / 1_000_000;
}

/** The API key, or the exact reason there is none. Order: the environment, var/.env, the keychain (models/env.ts). */
export function apiKey(): KeyResult {
  return apiKeyFor('ANTHROPIC_API_KEY', { keychainItem: KEYCHAIN_ITEM });
}

let client: Anthropic | null = null;

export const anthropicModel: ModelFn = async (prompt, system, opts) => {
  if (!PRICING[opts.model]) throw new Error(`unknown model ${opts.model}`);
  if (!client) {
    const k = apiKey();
    if (!k.ok) throw new Error(k.why);
    client = new Anthropic({ apiKey: k.key });
  }
  const t0 = Date.now();
  const res = await client.messages.create({
    model: opts.model,
    max_tokens: ADAPTER_SETTINGS.maxTokens,
    thinking: ADAPTER_SETTINGS.thinking,
    output_config: { effort: ADAPTER_SETTINGS.effort },
    ...(system ? { system } : {}),
    messages: [{ role: 'user', content: prompt }],
  });
  const latencyMs = Date.now() - t0;
  const text = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
  const usage = {
    inputTokens: res.usage.input_tokens,
    outputTokens: res.usage.output_tokens,
    cacheReadTokens: res.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: res.usage.cache_creation_input_tokens ?? 0,
  };
  return { text, ...usage, model: res.model, latencyMs, stopReason: res.stop_reason ?? null, costUsd: costUsd(opts.model, usage) };
};
