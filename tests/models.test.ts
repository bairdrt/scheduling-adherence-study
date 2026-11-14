import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeOpenAIModel, openaiCostUsd, OPENAI_DEFAULT_MODEL, type OpenAIClientLike } from '../models/openai.js';
import { geminiCostUsd, makeGeminiModel, GEMINI_DEFAULT_MODEL, type GeminiClientLike } from '../models/gemini.js';
import { adapterFor } from '../models/index.js';
import { apiKeyFor, dotenvValue } from '../models/env.js';
import { costUsd } from '../models/anthropic.js';

describe('the OpenAI adapter, stubbed client', () => {
  it('sends one Responses request in the pinned shape and reads text, usage and status back', async () => {
    const sent: unknown[] = [];
    const client: OpenAIClientLike = { responses: { create: async (req) => { sent.push(req); return { model: 'gpt-6-astra', status: 'completed', output_text: '{"tool":"wait"}', usage: { input_tokens: 1000, output_tokens: 200, input_tokens_details: { cached_tokens: 400 }, output_tokens_details: { reasoning_tokens: 150 }, total_tokens: 1200 } } as never; } } };
    const r = await makeOpenAIModel(client)('the prompt', 'the system line', { model: OPENAI_DEFAULT_MODEL });
    expect(sent).toEqual([{ model: 'gpt-6-astra', instructions: 'the system line', input: 'the prompt', max_output_tokens: 16384, reasoning: { effort: 'high' }, store: false }]);
    expect(sent[0]).not.toHaveProperty('temperature');
    expect(r).toMatchObject({ text: '{"tool":"wait"}', inputTokens: 1000, outputTokens: 200, cacheReadTokens: 400, model: 'gpt-6-astra', stopReason: 'completed' });
    expect(r.costUsd).toBeCloseTo((600 * 10 + 400 * 1 + 200 * 50) / 1e6, 10);
  });

  it('names an incomplete answer and refuses a price it has not verified', async () => {
    const client: OpenAIClientLike = { responses: { create: async () => ({ model: 'gpt-6-astra', status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output_text: '', usage: { input_tokens: 10, output_tokens: 16384 } } as never) } };
    expect((await makeOpenAIModel(client)('p', 's', { model: 'gpt-6-astra' })).stopReason).toBe('incomplete:max_output_tokens');
    expect(() => openaiCostUsd('gpt-unpriced', { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0 })).toThrow(/no verified price/);
    expect(() => openaiCostUsd('gpt-6-astra', { inputTokens: 300_000, outputTokens: 1, cacheReadTokens: 0 })).toThrow(/long-context/);
  });
});

describe('the Gemini adapter, stubbed client', () => {
  it('sends one generateContent request in the pinned shape and reads text, usage and finish reason back', async () => {
    const sent: unknown[] = [];
    const client: GeminiClientLike = { models: { generateContent: async (req) => { sent.push(req); return { text: '{"tool":"wait"}', modelVersion: 'gemini-4-argon', candidates: [{ finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 50, thoughtsTokenCount: 150, cachedContentTokenCount: 100 } } as never; } } };
    const r = await makeGeminiModel(client)('the prompt', 'the system line', { model: GEMINI_DEFAULT_MODEL });
    expect(sent).toEqual([{ model: 'gemini-4-argon', contents: 'the prompt', config: { systemInstruction: 'the system line', maxOutputTokens: 16384, thinkingConfig: { thinkingLevel: 'HIGH' } } }]);
    expect((sent[0] as { config: object }).config).not.toHaveProperty('temperature');
    expect(r).toMatchObject({ text: '{"tool":"wait"}', inputTokens: 1000, outputTokens: 200, cacheReadTokens: 100, model: 'gemini-4-argon', stopReason: 'STOP' });
  });

  it('prices by the date the page gives and throws outside every dated entry', () => {
    const u = { inputTokens: 1_000_000, outputTokens: 1_000_000, cacheReadTokens: 0 };
    expect(geminiCostUsd('gemini-4-argon', u, new Date('2026-11-05T12:00:00Z'))).toBeCloseTo(12, 10);
    expect(geminiCostUsd('gemini-4-argon', u, new Date('2026-12-02T12:00:00Z'))).toBeCloseTo(24, 10);
    expect(() => geminiCostUsd('gemini-4-argon', u, new Date('2026-09-01T00:00:00Z'))).toThrow(/no verified price/);
    expect(() => geminiCostUsd('gemini-unpriced', u)).toThrow(/no verified price/);
  });
});

describe('adapter resolution and keys', () => {
  it('resolves an adapter by id prefix and refuses an id it cannot place', () => {
    expect(adapterFor('claude-sonnet-5').provider).toBe('anthropic');
    expect(adapterFor('gpt-6-astra').provider).toBe('openai');
    expect(adapterFor('gemini-4-argon').provider).toBe('google');
    expect(() => adapterFor('llama-9')).toThrow(/no adapter/);
    expect(() => costUsd('claude-unknown', { inputTokens: 1, outputTokens: 1 })).toThrow(/no price/);
  });

  it('reads a key from the environment first, then the .env file, and says why when there is none', () => {
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'env-')), '.env');
    fs.writeFileSync(f, 'OPENAI_API_KEY="sk-test"\nGEMINI_API_KEY=\n');
    expect(dotenvValue('OPENAI_API_KEY', f)).toBe('sk-test');
    expect(dotenvValue('GEMINI_API_KEY', f)).toBeUndefined();
    const saved = process.env['OPENAI_API_KEY'];
    delete process.env['OPENAI_API_KEY'];
    expect(apiKeyFor('OPENAI_API_KEY', { file: f })).toEqual({ ok: true, key: 'sk-test', from: 'var/.env' });
    expect(apiKeyFor('GEMINI_API_KEY', { file: f })).toMatchObject({ ok: false });
    process.env['OPENAI_API_KEY'] = 'sk-env';
    expect(apiKeyFor('OPENAI_API_KEY', { file: f })).toMatchObject({ ok: true, from: 'OPENAI_API_KEY' });
    if (saved === undefined) delete process.env['OPENAI_API_KEY']; else process.env['OPENAI_API_KEY'] = saved;
  });
});
