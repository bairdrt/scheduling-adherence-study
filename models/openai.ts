/**
 * THE OPENAI ADAPTER (docs/study-design.md sections 5 and 9), the Responses API through the official `openai` package
 * (7.43.0, pinned: the newest release on or before 2026-10-22). One `responses.create` per step, nothing else.
 *
 * WHY RESPONSES, NOT CHAT COMPLETIONS: OpenAI's model page for gpt-6-astra lists both endpoints, and its latest-model
 * guide says tool calling for this family requires Responses. The bench sends no tool definitions (the loop's tools are
 * named in the prompt and answered as JSON text, the same for every provider), so either would do; Responses is the
 * endpoint OpenAI documents first for this model, and its `instructions` field carries the system line as-is.
 *
 * DEFAULT MODEL: gpt-6-astra. Source: https://developers.openai.com/api/docs/models ("If you're not sure where to start,
 * use GPT-6 Astra, our flagship model for complex reasoning and coding"), read 2026-11-05. No dated snapshot exists
 * (its model page: "Default snapshot: gpt-6-astra"), so the id the provider returns is recorded on every call.
 *
 * PINNED, AND RECORDED IN EVERY JSONL LINE (OPENAI_SETTINGS):
 *   - max_output_tokens 16384, the same budget as the Anthropic adapter (it includes reasoning tokens here);
 *   - reasoning.effort "high", matching the Anthropic adapter's effort; "none" is not supported on gpt-6-astra;
 *   - temperature and top_p NOT SENT: the 2026-09-03 changelog says GPT-6 Astra does not support custom values. Whether
 *     sending one is a 400 or ignored is not documented, so it is omitted. Recorded as null;
 *   - no seed: the Responses API has none. The "seed" is the repetition index, as for Anthropic;
 *   - store false: nothing is kept server-side, no previous_response_id; every step is a fresh, stateless request.
 * The key: OPENAI_API_KEY from the environment or var/.env (models/env.ts). No keychain item is named.
 */
import OpenAI from 'openai';
import { apiKeyFor } from './env.js';
import type { ModelFn, Price } from './types.js';

export const OPENAI_DEFAULT_MODEL = 'gpt-6-astra';

/**
 * USD per million tokens, Standard tier, from https://developers.openai.com/api/docs/pricing (read 2026-11-05):
 * gpt-6-astra short context: input $10.00, cached input $1.00, output $50.00. Its long-context rate (input over 272K
 * tokens: $20.00 / $2.00 / $75.00) is not in the table: costUsd throws past 272K rather than price it wrong.
 * A model absent here has no verified price and costUsd throws.
 */
export const OPENAI_PRICING: Record<string, Price & { shortContextMaxInput: number }> = {
  'gpt-6-astra': { in: 10, cachedIn: 1, out: 50, shortContextMaxInput: 272_000 },
};

export const OPENAI_SETTINGS = {
  provider: 'openai',
  sdk: 'openai 7.43.0',
  api: 'responses.create',
  maxTokens: 16384,
  effort: 'high' as const,
  store: false,
  temperature: null,
  temperatureNote: 'not sent: GPT-6 Astra does not support custom temperature or top_p (OpenAI changelog 2026-09-03)',
  seed: 'repetition index only; the Responses API takes no seed',
} as const;

export function openaiCostUsd(model: string, u: { inputTokens: number; outputTokens: number; cacheReadTokens: number }): number {
  const p = OPENAI_PRICING[model];
  if (!p) throw new Error(`no verified price for ${model}; add it to OPENAI_PRICING with its source`);
  if (u.inputTokens > p.shortContextMaxInput) throw new Error(`${model}: ${u.inputTokens} input tokens is past the short-context tier (${p.shortContextMaxInput}); its long-context price is not in the table`);
  // input_tokens INCLUDES the cached ones (usage.input_tokens_details.cached_tokens); output includes reasoning.
  return ((u.inputTokens - u.cacheReadTokens) * p.in + u.cacheReadTokens * (p.cachedIn ?? p.in) + u.outputTokens * p.out) / 1_000_000;
}

/** The request, exactly as sent (exported so the test can check its shape without a network). */
export function openaiRequest(prompt: string, system: string, model: string): OpenAI.Responses.ResponseCreateParamsNonStreaming {
  return {
    model,
    ...(system ? { instructions: system } : {}),
    input: prompt,
    max_output_tokens: OPENAI_SETTINGS.maxTokens,
    reasoning: { effort: OPENAI_SETTINGS.effort },
    store: OPENAI_SETTINGS.store,
  };
}

/** The part of the client the adapter calls (a stub in tests). */
export interface OpenAIClientLike { responses: { create: (req: OpenAI.Responses.ResponseCreateParamsNonStreaming) => Promise<OpenAI.Responses.Response> } }

export function makeOpenAIModel(clientIn?: OpenAIClientLike): ModelFn {
  let client: OpenAIClientLike | null = clientIn ?? null;
  return async (prompt, system, opts) => {
    if (!OPENAI_PRICING[opts.model]) throw new Error(`unknown model ${opts.model}: no verified price`);
    if (!client) {
      const k = apiKeyFor('OPENAI_API_KEY');
      if (!k.ok) throw new Error(k.why);
      client = new OpenAI({ apiKey: k.key });
    }
    const t0 = Date.now();
    const res = await client.responses.create(openaiRequest(prompt, system, opts.model));
    const latencyMs = Date.now() - t0;
    const usage = {
      inputTokens: res.usage?.input_tokens ?? 0,
      outputTokens: res.usage?.output_tokens ?? 0,
      cacheReadTokens: res.usage?.input_tokens_details?.cached_tokens ?? 0,
      cacheWriteTokens: 0,
    };
    // status "incomplete" carries its reason (max_output_tokens, content_filter, ...); the loop reads empty text as unreadable.
    const stopReason = res.status === 'incomplete' ? `incomplete:${res.incomplete_details?.reason ?? 'unknown'}` : (res.status ?? null);
    return { text: res.output_text ?? '', ...usage, model: res.model, latencyMs, stopReason, costUsd: openaiCostUsd(opts.model, usage) };
  };
}

export const openaiModel: ModelFn = makeOpenAIModel();
