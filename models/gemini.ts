/**
 * THE GEMINI ADAPTER (docs/study-design.md sections 5 and 9), `models.generateContent` through the official
 * `@google/genai` package (2.30.0, pinned: the newest release on or before 2026-10-22). One call per step.
 *
 * DEFAULT MODEL: gemini-4-argon, GA ("Stable: gemini-4-argon"). Source: https://aistudio.google.com/docs/models
 * ("Our flagship reasoning model") and its model page, read 2026-11-05. Google's docs now lead with the Interactions
 * API; generateContent is still documented (https://aistudio.google.com/docs/api/generate-content) and is what the
 * SDK's typed config covers, so it is used here.
 *
 * PINNED, AND RECORDED IN EVERY JSONL LINE (GEMINI_SETTINGS):
 *   - maxOutputTokens 16384, the same budget as the other adapters;
 *   - thinkingConfig.thinkingLevel HIGH, matching the others' "high" effort. The model page lists thinking levels low,
 *     medium, high (default medium). That generateContent honours thinkingLevel for this model is NOT verified from a
 *     doc (the per-model table is on the Interactions page); the first live call should be checked for thoughts tokens;
 *   - temperature NOT SENT: Google's text-generation docs say Gemini 4 models ignore custom temperature, top_p, top_k;
 *   - no seed sent: the config accepts one, but no doc says it has an effect on this model, and the other adapters
 *     have none; the "seed" is the repetition index.
 * The key: GEMINI_API_KEY from the environment or var/.env (models/env.ts).
 */
import { GoogleGenAI, ThinkingLevel, type GenerateContentParameters, type GenerateContentResponse } from '@google/genai';
import { apiKeyFor } from './env.js';
import type { ModelFn, Price } from './types.js';

export const GEMINI_DEFAULT_MODEL = 'gemini-4-argon';

/**
 * USD per million tokens, paid tier, from https://aistudio.google.com/docs/pricing (Standard tab, read 2026-11-05):
 * gemini-4-argon input $2.00, output (thinking included) $10.00, context caching $0.10, THROUGH 2026-11-30; the same
 * page lists $4.00 / $20.00 / $0.20 from 2026-12-01. No prompt-length tiers for this model. Each entry carries the
 * dates it holds for: costUsd throws for a call outside them rather than bill at a stale price.
 */
export const GEMINI_PRICING: Record<string, Array<Price & { from: string; through: string }>> = {
  'gemini-4-argon': [
    { in: 2, out: 10, cachedIn: 0.1, from: '2026-10-01', through: '2026-11-30' },
    { in: 4, out: 20, cachedIn: 0.2, from: '2026-12-01', through: '2027-12-31' },
  ],
};

export const GEMINI_SETTINGS = {
  provider: 'google',
  sdk: '@google/genai 2.30.0',
  api: 'models.generateContent',
  maxTokens: 16384,
  thinkingLevel: 'HIGH' as const,
  thinkingNote: 'thinkingLevel via generateContent on gemini-4-argon not verified from a doc; check thoughtsTokenCount',
  temperature: null,
  temperatureNote: 'not sent: Gemini 4 models ignore custom temperature (Google text-generation docs)',
  seed: 'repetition index only; no seed sent',
} as const;

export function geminiCostUsd(model: string, u: { inputTokens: number; outputTokens: number; cacheReadTokens: number }, at: Date = new Date()): number {
  const day = at.toISOString().slice(0, 10);
  const p = (GEMINI_PRICING[model] ?? []).find((x) => day >= x.from && day <= x.through);
  if (!p) throw new Error(`no verified price for ${model} on ${day}; add it to GEMINI_PRICING with its source`);
  // promptTokenCount INCLUDES cachedContentTokenCount; the output count here already includes thoughts.
  return ((u.inputTokens - u.cacheReadTokens) * p.in + u.cacheReadTokens * (p.cachedIn ?? p.in) + u.outputTokens * p.out) / 1_000_000;
}

/** The request, exactly as sent (exported so the test can check its shape without a network). */
export function geminiRequest(prompt: string, system: string, model: string): GenerateContentParameters {
  return {
    model,
    contents: prompt,
    config: {
      ...(system ? { systemInstruction: system } : {}),
      maxOutputTokens: GEMINI_SETTINGS.maxTokens,
      thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
    },
  };
}

/** The part of the client the adapter calls (a stub in tests). */
export interface GeminiClientLike { models: { generateContent: (req: GenerateContentParameters) => Promise<GenerateContentResponse> } }

export function makeGeminiModel(clientIn?: GeminiClientLike): ModelFn {
  let client: GeminiClientLike | null = clientIn ?? null;
  return async (prompt, system, opts) => {
    if (!GEMINI_PRICING[opts.model]) throw new Error(`unknown model ${opts.model}: no verified price`);
    if (!client) {
      const k = apiKeyFor('GEMINI_API_KEY');
      if (!k.ok) throw new Error(k.why);
      client = new GoogleGenAI({ apiKey: k.key });
    }
    const t0 = Date.now();
    const res = await client.models.generateContent(geminiRequest(prompt, system, opts.model));
    const latencyMs = Date.now() - t0;
    const m = res.usageMetadata;
    const usage = {
      inputTokens: m?.promptTokenCount ?? 0,
      outputTokens: (m?.candidatesTokenCount ?? 0) + (m?.thoughtsTokenCount ?? 0),
      cacheReadTokens: m?.cachedContentTokenCount ?? 0,
      cacheWriteTokens: 0,
    };
    return { text: res.text ?? '', ...usage, model: res.modelVersion ?? opts.model, latencyMs, stopReason: res.candidates?.[0]?.finishReason ?? null, costUsd: geminiCostUsd(opts.model, usage) };
  };
}

export const geminiModel: ModelFn = makeGeminiModel();
