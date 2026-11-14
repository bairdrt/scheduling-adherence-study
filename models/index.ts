/**
 * WHICH ADAPTER ANSWERS A MODEL ID: by prefix (claude- Anthropic, gpt- / o<digit> OpenAI, gemini- Google), with the
 * settings each adapter pins, for the JSONL line. `bench/run.ts --model=<id>` resolves through here.
 */
import { ADAPTER_SETTINGS, anthropicModel, apiKey as anthropicKey } from './anthropic.js';
import { apiKeyFor, type KeyResult } from './env.js';
import { GEMINI_SETTINGS, geminiModel } from './gemini.js';
import { OPENAI_SETTINGS, openaiModel } from './openai.js';
import type { ModelFn } from './types.js';

export type AdapterSettings = typeof ADAPTER_SETTINGS | typeof OPENAI_SETTINGS | typeof GEMINI_SETTINGS;
export interface Adapter { provider: 'anthropic' | 'openai' | 'google'; fn: ModelFn; settings: AdapterSettings; key: () => KeyResult }

export function adapterFor(model: string): Adapter {
  if (model.startsWith('claude-')) return { provider: 'anthropic', fn: anthropicModel, settings: ADAPTER_SETTINGS, key: anthropicKey };
  if (/^(gpt-|o\d)/.test(model)) return { provider: 'openai', fn: openaiModel, settings: OPENAI_SETTINGS, key: () => apiKeyFor('OPENAI_API_KEY') };
  if (model.startsWith('gemini-')) return { provider: 'google', fn: geminiModel, settings: GEMINI_SETTINGS, key: () => apiKeyFor('GEMINI_API_KEY') };
  throw new Error(`no adapter for model id ${model}: ids start with claude-, gpt- (or o<digit>), or gemini-`);
}
