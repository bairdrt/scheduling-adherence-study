/**
 * THE PROSE JUDGE PASS, P1 TO P4 (docs/study-design.md section 7; rubric in graders/prose.ts).
 *
 *   npx tsx bench/judge.ts --runs=runs/<day>/ [--limit=N] [--out=<dir>] [--force] [--dry-run]
 *
 * For every run file `X.jsonl` under --runs, writes `X.judged.jsonl` BESIDE it (or under --out), every line copied with a
 * `judge` block added: one judged item per outbound text (tell_bob text, propose note, ask text), the judge model and
 * its settings, the rubric version and hash, and each item's prompt hash. The run file is never rewritten. An existing
 * judged file is skipped unless --force. --limit=N judges the first N texts only (the smoke test; lines past it carry
 * no judge block), --dry-run prints the first prompt and calls nothing.
 *
 * The judge is one Messages API call per text, claude-sonnet-5 (named by the study brief), adaptive thinking, effort
 * medium, structured output to the rubric's JSON schema. Nothing it does sends mail, writes a calendar or reaches Bob.
 */
import fs from 'node:fs';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { apiKey, costUsd } from '../models/anthropic.js';
import { REPO_ROOT } from '../conditions/world.js';
import { loadScenario } from '../scenarios/load.js';
import { JUDGE_SCHEMA, RUBRIC_HASH, RUBRIC_VERSION, judgePrompt, outboundTexts, parseJudge, sha, type JudgeBlock, type JudgeItem } from '../graders/prose.js';
import type { RunLine } from './run.js';

export const JUDGE_MODEL = 'claude-sonnet-5';
export const JUDGE_SETTINGS = { provider: 'anthropic', sdk: '@anthropic-ai/sdk 1.5.0', maxTokens: 8000, thinking: { type: 'adaptive' as const }, effort: 'medium' as const, format: 'json_schema (graders/prose.ts JUDGE_SCHEMA)', temperature: null };

export interface JudgeCall { text: string; inputTokens: number; outputTokens: number; costUsd: number; model: string; stopReason: string | null }
export type JudgeFn = (prompt: string) => Promise<JudgeCall>;

let client: Anthropic | null = null;
export const anthropicJudge: JudgeFn = async (prompt) => {
  if (!client) { const k = apiKey(); if (!k.ok) throw new Error(k.why); client = new Anthropic({ apiKey: k.key }); }
  const res = await client.messages.create({
    model: JUDGE_MODEL,
    max_tokens: JUDGE_SETTINGS.maxTokens,
    thinking: JUDGE_SETTINGS.thinking,
    output_config: { effort: JUDGE_SETTINGS.effort, format: { type: 'json_schema', schema: JUDGE_SCHEMA as unknown as Record<string, unknown> } },
    messages: [{ role: 'user', content: prompt }],
  });
  const text = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
  const usage = { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens, cacheReadTokens: res.usage.cache_read_input_tokens ?? 0, cacheWriteTokens: res.usage.cache_creation_input_tokens ?? 0 };
  return { text, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, costUsd: costUsd(JUDGE_MODEL, usage), model: res.model, stopReason: res.stop_reason ?? null };
};

const tzCache = new Map<string, string>();
export function tzOf(scenario: string): string {
  if (!tzCache.has(scenario)) { try { tzCache.set(scenario, loadScenario(scenario).tz); } catch { tzCache.set(scenario, 'UTC'); } }
  return tzCache.get(scenario)!;
}

/** Judge every outbound text of one line (up to `budget.left` texts); the line comes back with its judge block. */
export async function judgeLine(l: RunLine, fn: JudgeFn, budget: { left: number } = { left: Infinity }, now = new Date()): Promise<RunLine> {
  const texts = outboundTexts(l);
  if (budget.left <= 0) return l;
  const items: JudgeItem[] = [];
  for (const t of texts) {
    if (budget.left <= 0) break;
    budget.left -= 1;
    const prompt = judgePrompt(l, t, tzOf(l.scenario));
    const base = { ...t, promptSha: sha(prompt) };
    try {
      const r = await fn(prompt);
      const common = { tokens: { in: r.inputTokens, out: r.outputTokens }, costUsd: r.costUsd, modelReturned: r.model, stopReason: r.stopReason };
      try { items.push({ ...base, ...common, verdict: parseJudge(r.text) }); } catch (e) { items.push({ ...base, ...common, error: String(e instanceof Error ? e.message : e) }); }
    } catch (e) {
      items.push({ ...base, tokens: { in: 0, out: 0 }, costUsd: 0, modelReturned: '', stopReason: null, error: String(e instanceof Error ? e.message : e) });
    }
  }
  const judge: JudgeBlock = { model: JUDGE_MODEL, settings: JUDGE_SETTINGS, rubricVersion: RUBRIC_VERSION, rubricHash: RUBRIC_HASH, judgedAt: now.toISOString(), items, costUsd: items.reduce((n, i) => n + i.costUsd, 0) };
  return { ...l, judge };
}

function runFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (p: string): void => {
    if (fs.statSync(p).isDirectory()) { for (const f of fs.readdirSync(p).sort()) walk(path.join(p, f)); return; }
    if (p.endsWith('.jsonl') && !p.endsWith('.judged.jsonl')) out.push(p);
  };
  walk(dir);
  return out;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const arg = (k: string): string | undefined => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  const runs = arg('runs');
  if (!runs) { console.error('usage: npx tsx bench/judge.ts --runs=runs/<day>/ [--limit=N] [--out=<dir>] [--force] [--dry-run]'); process.exit(2); }
  const dir = path.resolve(REPO_ROOT, runs);
  const limit = arg('limit') ? Number(arg('limit')) : Infinity;
  const outDir = arg('out') ? path.resolve(arg('out')!) : null;
  const force = args.includes('--force'); const dry = args.includes('--dry-run');
  if (dry) {
    for (const f of runFiles(dir)) for (const raw of fs.readFileSync(f, 'utf8').split('\n').filter(Boolean)) {
      const l = JSON.parse(raw) as RunLine; const t = outboundTexts(l)[0];
      if (t) { console.log(judgePrompt(l, t, tzOf(l.scenario))); console.log(`\n(rubric ${RUBRIC_VERSION} ${RUBRIC_HASH}; ${path.relative(REPO_ROOT, f)} step ${t.step})`); return; }
    }
    console.log('no outbound text found'); return;
  }
  const k = apiKey(); if (!k.ok) { console.error(`BLOCKED: no Anthropic API key. ${k.why}`); process.exit(3); }
  const budget = { left: limit };
  let total = 0; let judgedTexts = 0;
  for (const f of runFiles(dir)) {
    if (budget.left <= 0) break;
    const target = outDir ? path.join(outDir, path.basename(f).replace(/\.jsonl$/, '.judged.jsonl')) : f.replace(/\.jsonl$/, '.judged.jsonl');
    if (fs.existsSync(target) && !force) { console.log(`skip ${path.relative(REPO_ROOT, target)} (exists; --force to redo)`); continue; }
    const out: string[] = [];
    for (const raw of fs.readFileSync(f, 'utf8').split('\n').filter(Boolean)) {
      const l = await judgeLine(JSON.parse(raw) as RunLine, anthropicJudge, budget);
      if (l.judge) {
        total += l.judge.costUsd; judgedTexts += l.judge.items.length;
        for (const i of l.judge.items) console.log(`${l.scenario} e${l.eventIndex} ${l.condition} seed ${l.seed} step ${i.step} ${i.tool}.${i.field}: ${i.verdict ? Object.entries(i.verdict).filter(([, v]) => v.fires).map(([p]) => p).join(',') || 'none' : `ERROR ${i.error}`} ($${i.costUsd.toFixed(4)})`);
      }
      out.push(JSON.stringify(l));
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `${out.join('\n')}\n`);
    console.log(`  -> ${target}`);
  }
  console.log(`judged ${judgedTexts} text(s), judge cost $${total.toFixed(4)} (rubric ${RUBRIC_VERSION} ${RUBRIC_HASH})`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main().catch((e: unknown) => { console.error(e); process.exit(1); });
}
