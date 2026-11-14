/**
 * THE BENCH RUNNER (docs/study-design.md sections 8 and 9).
 *
 *   npx tsx bench/run.ts --scenario=plan-39[,accept-first,...|all] --condition=A|A0|B|C|all --model=claude-sonnet-5 --seeds=3 [--seed-from=N] [--event=N]
 *
 * --seed-from=N starts the repetition index at N instead of 1 (seeds N..--seeds), so a column can be topped up to the
 * matrix's N without re-running the seeds it has (design section 14: Sonnet 5's B and C at bd29f14 had five).
 *
 * Conditions (docs/study-design.md sections 4 and 13): A raw tools, no prepared state (conditions/raw.ts); A0 the old
 * one-action bare prompt (conditions/bare.ts), kept for the record and not in the matrix; B the loop with guards
 * shadowed; C the full harness. `all` is A, B and C.
 *
 * --model resolves its adapter by id prefix (models/index.ts): claude- Anthropic, gpt- OpenAI, gemini- Google.
 * A scenario with several events runs them IN ORDER, carrying the plan between them (conditions/sequence.ts); each
 * event is its own JSONL line, graded on its own expectation. --event=N runs event N alone, its world resolved from the
 * scenario's own record of the earlier events.
 *
 * Writes runs/<YYYY-MM-DD>/<scenario>-<condition>-<model>-<timestamp>.jsonl, one line per event per run (one file per condition),
 * every field of design section 8, and prints one summary line per run. Nothing it runs sends mail, writes a
 * calendar, touches a ledger or reaches Bob: every outward tool only records (conditions/common.ts recordingDeps).
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadScenario, type Scenario } from '../scenarios/load.js';
import { scenarioIds, type EventWorld } from '../scenarios/load.js';
import { runSequence } from '../conditions/sequence.js';
import { planState, type Condition, type ConditionResult } from '../conditions/common.js';
import { REPO_ROOT } from '../conditions/world.js';
import { gradeRun, V_KEYS, type Grades } from '../graders/index.js';
import { adapterFor, type AdapterSettings } from '../models/index.js';
import type { ModelFn } from '../models/types.js';
import type { JudgeBlock } from '../graders/prose.js';

export const VENDORED_COMMIT = 'bd29f14287067e0aa54fb039e8e0ca9b5427eeae';

export interface RunLine {
  /** A (raw tools), A0 (bare, one action), B, C. Lines written before 2026-11-06 say 'A' for what is now A0 (conditionOf). */
  scenario: string; eventIndex: number; condition: Condition; model: string; modelSettings: AdapterSettings | { provider: 'scripted' }; seed: number;
  /** Where this event sits: the events run in this sequence, the event's instant, and where its carry came from. */
  sequence: { from: number; to: number; events: number; now: string; carriedFrom: EventWorld['carriedFrom'] };
  harness: { vendoredCommit: string; stepCap: number };
  startedAt: string; wallMs: number;
  system: string;
  steps: Array<{ n: number; prompt: string; text: string; parsed: unknown; unreadable?: string; result: string; refused: boolean; shadowed: unknown[]; tokens: { in: number; out: number; cacheRead: number; cacheWrite: number }; latencyMs: number; stopReason: string | null; modelReturned: string; error?: string }>;
  /** The mapped decision (tool, args) the graders read; in A, `raw` is the raw call it was mapped from. */
  actions: Array<{ step: number; tool: string; args: Record<string, unknown>; thought: string; refused: boolean; shadowed: unknown[]; result?: string; context: unknown; raw?: { tool: string; args: Record<string, unknown> } }>;
  facts?: unknown[];
  outcome: string;
  would: unknown[];
  shadowedRefusals: Array<{ step: number; site: string; refusal: string; outcome: string }>;
  graders: Grades;
  tokens: { in: number; out: number; cacheRead: number; cacheWrite: number };
  costUsd: number;
  error?: string;
  /** The prose judge's verdicts, added by bench/judge.ts in a .judged.jsonl copy beside the run file (never in place). */
  judge?: JudgeBlock;
}

function settingsFor(model: string): RunLine['modelSettings'] {
  try { return adapterFor(model).settings; } catch { return { provider: 'scripted' }; }
}

/** One graded line from one event's run. */
export function lineFor(sc: Scenario, ev: EventWorld, r: ConditionResult, model: string, seed: number, range: { from: number; to: number }, startedAt: string, wallMs: number): RunLine {
  const condition = r.condition;
  const state = planState(sc, ev);
  const graders = gradeRun(sc, ev, state, r);
  const stepCount = Math.max(r.steps.length, r.calls.length);
  const steps = Array.from({ length: stepCount }, (_, i) => {
    const c = r.calls[i]; const s = r.steps[i];
    const shadowed = r.actions.filter((a) => a.step === i + 1).flatMap((a) => a.shadowed);
    return {
      n: i + 1, prompt: c?.prompt ?? '', text: c?.text ?? s?.raw ?? '', parsed: s?.parsed ?? null, ...(s?.unreadable ? { unreadable: s.unreadable } : {}),
      result: s?.result ?? '', refused: s?.refused ?? false, shadowed,
      tokens: { in: c?.inputTokens ?? 0, out: c?.outputTokens ?? 0, cacheRead: c?.cacheReadTokens ?? 0, cacheWrite: c?.cacheWriteTokens ?? 0 },
      latencyMs: c?.latencyMs ?? 0, stopReason: c?.stopReason ?? null, modelReturned: c?.model ?? '', ...(c?.error ? { error: c.error } : {}),
    };
  });
  const sum = (k: 'inputTokens' | 'outputTokens' | 'cacheReadTokens' | 'cacheWriteTokens'): number => r.calls.reduce((n, c) => n + c[k], 0);
  return {
    scenario: sc.id, eventIndex: ev.index, condition, model, modelSettings: settingsFor(model), seed,
    sequence: { from: range.from, to: range.to, events: sc.events.length, now: ev.now, carriedFrom: ev.carriedFrom },
    harness: { vendoredCommit: VENDORED_COMMIT, stepCap: r.cap },
    startedAt, wallMs, system: r.calls[0]?.system ?? '',
    steps,
    actions: r.actions.map((a) => ({ step: a.step, tool: a.decision.tool, args: a.decision.args, thought: a.decision.thought, refused: a.refused, shadowed: a.shadowed, ...(a.result !== undefined ? { result: a.result } : {}), context: a.context, ...(a.raw ? { raw: a.raw } : {}) })),
    ...(r.facts ? { facts: r.facts } : {}),
    outcome: r.outcome, would: r.would,
    shadowedRefusals: r.actions.flatMap((a) => a.shadowed.map((s) => ({ step: a.step, ...s }))),
    graders,
    tokens: { in: sum('inputTokens'), out: sum('outputTokens'), cacheRead: sum('cacheReadTokens'), cacheWrite: sum('cacheWriteTokens') },
    costUsd: r.calls.reduce((n, c) => n + c.costUsd, 0),
    ...(r.error ? { error: r.error } : {}),
  };
}

/** Events `from..to` of a scenario under one condition, in order with the carry; one line per event. */
export async function runScenario(sc: Scenario, condition: Condition, modelFn: ModelFn, model: string, seed: number, range: { from?: number; to?: number } = {}): Promise<RunLine[]> {
  const from = range.from ?? 0; const to = range.to ?? sc.events.length - 1;
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const runs = await runSequence(condition, sc, modelFn, model, { from, to });
  const wallMs = Date.now() - t0;
  // The sequence's wall time, shared between its events by model-call count.
  const calls = runs.reduce((n, x) => n + Math.max(1, x.result.calls.length), 0);
  return runs.map((x) => lineFor(sc, x.ev, x.result, model, seed, { from, to }, startedAt, Math.round((wallMs * Math.max(1, x.result.calls.length)) / calls)));
}

/** One event, standalone (phase 1's entry point, kept for the tests). */
export async function runOne(sc: Scenario, eventIndex: number, condition: Condition, modelFn: ModelFn, model: string, seed: number): Promise<RunLine> {
  return (await runScenario(sc, condition, modelFn, model, seed, { from: eventIndex, to: eventIndex }))[0]!;
}

/**
 * The condition a stored line was run under: lines written before A was redefined (2026-11-06) say 'A' for the one-action
 * bare condition, now A0; they are told apart by the step cap (A0's is 1, A's is 10).
 */
export function conditionOf(l: Pick<RunLine, 'condition' | 'harness'>): Condition {
  return l.condition === 'A' && l.harness?.stepCap === 1 ? 'A0' : l.condition;
}

/** One line a person reads: steps, the final action, what fired, what was shadowed, the cost. */
export function summaryLine(l: RunLine): string {
  const last = l.actions[l.actions.length - 1];
  const fired = V_KEYS.filter((k) => l.graders[k]?.fired);
  const o = l.graders.outcome;
  return [
    `${l.scenario} e${l.eventIndex} ${l.condition} seed ${l.seed}: ${l.steps.length} step(s), outcome ${l.outcome}`,
    `final ${last ? `${last.raw ? `${last.raw.tool} as ` : ''}${last.tool} ${JSON.stringify(last.args).slice(0, 140)}${last.refused ? ' [REFUSED]' : ''}` : '(none)'}`,
    `class ${o.actual} (expected ${o.expected}) match=${o.match} [first=${o.firstStepMatch} reach=${o.reachesRequired} slot=${o.slotMatch} tellBob=${o.tellBobMatch}]`,
    `fired ${fired.length ? fired.join(',') : 'none'}`,
    `shadowed ${l.shadowedRefusals.length ? l.shadowedRefusals.map((s) => `${s.site}@${s.step}`).join(',') : 'none'}`,
    `$${l.costUsd.toFixed(4)}${l.error ? ` ERROR ${l.error.slice(0, 200)}` : ''}`,
  ].join(' | ');
}

function localStamp(d: Date): { day: string; stamp: string } {
  const pad = (n: number): string => String(n).padStart(2, '0');
  const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return { day, stamp: `${day}T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}` };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  // An unknown flag is refused, not ignored: `--help` once fell through to the defaults and started a real plan-39 run.
  const KNOWN = ['scenario', 'condition', 'model', 'seeds', 'seed-from', 'event'];
  const unknown = args.filter((a) => !KNOWN.some((k) => a.startsWith(`--${k}=`)));
  if (unknown.length) throw new Error(`unknown argument(s) ${unknown.join(' ')}; the flags are ${KNOWN.map((k) => `--${k}=`).join(' ')}`);
  const arg = (k: string): string | undefined => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  const scen = arg('scenario') ?? 'plan-39';
  const ids = scen === 'all' ? scenarioIds() : scen.split(',').map((x) => x.trim()).filter(Boolean);
  const cond = (arg('condition') ?? 'all').toUpperCase();
  const model = arg('model') ?? 'claude-sonnet-5';
  const seeds = Number(arg('seeds') ?? '3');
  const seedFrom = Number(arg('seed-from') ?? '1');
  const event = arg('event');
  const conditions = (cond === 'ALL' ? ['A', 'B', 'C'] : [cond]) as Condition[];
  if (!conditions.every((c) => ['A', 'A0', 'B', 'C'].includes(c))) throw new Error(`--condition must be A, A0, B, C or all, not ${cond}`);
  if (!Number.isInteger(seeds) || seeds < 1) throw new Error('--seeds must be a whole number, 1 or more');
  if (!Number.isInteger(seedFrom) || seedFrom < 1 || seedFrom > seeds) throw new Error('--seed-from must be a whole number from 1 to --seeds');
  const adapter = adapterFor(model);
  const key = adapter.key();
  if (!key.ok) { console.error(`BLOCKED: no ${adapter.provider} API key. ${key.why}`); process.exit(3); }
  const { day, stamp } = localStamp(new Date());
  const dir = path.join(REPO_ROOT, 'runs', day);
  fs.mkdirSync(dir, { recursive: true });
  let total = 0;
  for (const id of ids) {
    const sc = loadScenario(id);
    const range = event !== undefined ? { from: Number(event), to: Number(event) } : {};
    for (const c of conditions) {
      const file = path.join(dir, `${sc.id}-${c}-${model}-${stamp}.jsonl`);
      for (let seed = seedFrom; seed <= seeds; seed += 1) {
        const lines = await runScenario(sc, c, adapter.fn, model, seed, range);
        for (const line of lines) {
          fs.appendFileSync(file, `${JSON.stringify(line)}\n`);
          total += line.costUsd;
          console.log(summaryLine(line));
        }
      }
      console.log(`  -> ${path.relative(REPO_ROOT, file)}`);
    }
  }
  console.log(`total cost $${total.toFixed(4)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main().catch((e: unknown) => { console.error(e); process.exit(1); });
}
