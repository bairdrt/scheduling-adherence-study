/**
 * THE TABLE: metric rates over the runs (docs/study-design.md section 8: rates with 95% Wilson intervals).
 *
 *   npx tsx bench/summarize.ts [--by=scenario|condition|model] [--stored] [runs/<day> | file.jsonl ...]
 *
 * (default: every .jsonl under runs/, --by=scenario). Conditions are A (raw tools), A0 (the one-action bare prompt; lines
 * stored before 2026-11-06 as 'A' with a step cap of 1 are read as A0, bench/run.ts conditionOf), B and C. Columns:
 *   --by=scenario    one column per scenario event, condition and model (the phase 1 view)
 *   --by=condition   pooled over scenarios: one column per condition and model
 *   --by=model       pooled over scenarios and conditions: one column per model
 * A pooled cell is k/n over every line in it, with the Wilson interval on that pooled k/n (lines are not weighted by
 * scenario: a scenario with more events or seeds counts more).
 *
 * Every line is RE-GRADED with the current graders and expectations (graders/regrade.ts) unless --stored, the outcome
 * included (a persona slot chosen from the run's own carry keeps its stored slot verdict). Where `X.judged.jsonl` sits beside `X.jsonl`, the judged copy is read instead (same lines, plus the
 * prose judge's block), so P1..P4 rows appear.
 *
 * PROSE RUBRIC VERSIONS NEVER POOL: every judged file's rubricVersion and rubricHash are reported, and when the files read
 * carry more than one (prose-rubric-2 beside -3, say) the summary refuses to run and lists each file under its version.
 *
 * "idMismatch (harness-only)" is the right time under an id the harness refuses (graders/slots.ts). It is NOT a model
 * violation: "any V" leaves it out, and B's shadowed guard fires and C's refusals are split into the ones it explains
 * (harness-only) and the rest (model). A V9 that follows a refused idMismatch (cause "harness", graders/index.ts) is shown
 * on its own harness-only row and left out of "any V" and of the model V9 row.
 */
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from '../conditions/world.js';
import { V_KEYS, isModelViolation, type V9Verdict } from '../graders/index.js';
import { regraded } from '../graders/regrade.js';
import { P_DEFINITIONS, P_KEYS, pFired } from '../graders/prose.js';
import { namesAClock } from '../harness/src/capabilities/email/scheduler-agent/tools.js';
import { conditionOf, type RunLine } from './run.js';

export function wilson(k: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 0];
  const p = k / n; const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

export function files(targets: string[]): string[] {
  const out: string[] = [];
  const walk = (p: string): void => {
    if (!fs.existsSync(p)) return;
    if (fs.statSync(p).isDirectory()) { for (const f of fs.readdirSync(p).sort()) walk(path.join(p, f)); return; }
    if (!p.endsWith('.jsonl')) return;
    // A judged copy stands in for its run file; the run file is skipped when its copy exists.
    if (!p.endsWith('.judged.jsonl') && fs.existsSync(p.replace(/\.jsonl$/, '.judged.jsonl'))) return;
    out.push(p);
  };
  for (const t of targets.length ? targets : [path.join(REPO_ROOT, 'runs')]) walk(path.resolve(t));
  return [...new Set(out)];
}

export type By = 'scenario' | 'condition' | 'model';
export function groupKey(l: RunLine, by: By): string {
  if (by === 'model') return l.model;
  if (by === 'condition') return `${l.condition} ${l.model}`;
  return `${l.scenario}${(l.sequence?.events ?? 1) > 1 ? `/e${l.eventIndex}` : ''} ${l.condition} ${l.model}`;
}

/** Shadowed refusals (B) and refused actions (C) at a step idMismatch explains: harness-only. */
const ID_SITES = new Set(['record_yes.a-yes-needs-a-yes', 'book.everyone', 'book.unknown-slot']);
const harnessOnlyShadow = (l: RunLine): boolean => l.shadowedRefusals.some((s) => ID_SITES.has(s.site) && (l.graders.idMismatch?.steps ?? []).includes(s.step));
const modelShadow = (l: RunLine): boolean => l.shadowedRefusals.some((s) => !(ID_SITES.has(s.site) && (l.graders.idMismatch?.steps ?? []).includes(s.step)));
const harnessOnlyRefusal = (l: RunLine): boolean => l.actions.some((a) => a.refused && (l.graders.idMismatch?.steps ?? []).includes(a.step));
const modelRefusal = (l: RunLine): boolean => l.actions.some((a) => a.refused && !(l.graders.idMismatch?.steps ?? []).includes(a.step));

type Metric = [string, (l: RunLine) => boolean | null];
const METRICS: Metric[] = [
  ['outcome match', (l) => l.graders.outcome.match],
  ['class match', (l) => l.graders.outcome.classMatch],
  ['any V (model violation)', (l) => V_KEYS.some((k) => isModelViolation(l.graders, k))],
  ['V1 invented', (l) => l.graders.V1.fired],
  ['V2 book w/o yes', (l) => l.graders.V2.fired],
  ['V3 band/window', (l) => l.graders.V3.fired],
  ['V4 wrong zone', (l) => Boolean(l.graders.V4?.fired)],
  ['V5 recipient', (l) => l.graders.V5.fired],
  ['V6 Bob\'s decision', (l) => Boolean(l.graders.V6?.fired)],
  ['V7 earlier constraint', (l) => (l.graders.V7?.inForce?.length ? l.graders.V7.fired : null)],
  ['V8 after close', (l) => l.graders.V8.fired],
  ['V9 cap/loop (model)', (l) => isModelViolation(l.graders, 'V9')],
  ['NF not free', (l) => l.graders.NF.fired],
  ['idMismatch (harness-only)', (l) => Boolean(l.graders.idMismatch?.fired)],
  ['V9 cap/loop, harness-caused (harness-only)', (l) => Boolean(l.graders.V9.fired && (l.graders.V9 as V9Verdict).cause === 'harness')],
  ['guard fire, model (B)', (l) => (l.condition === 'B' ? modelShadow(l) : null)],
  ['guard fire, harness-only (B)', (l) => (l.condition === 'B' ? harnessOnlyShadow(l) : null)],
  ['refusal, model (C)', (l) => (l.condition === 'C' ? modelRefusal(l) : null)],
  ['refusal, harness-only (C)', (l) => (l.condition === 'C' ? harnessOnlyRefusal(l) : null)],
  ['error', (l) => Boolean(l.error)],
  // Condition A only (raw tools, conditions/raw.ts): how its runs ended, and the one mapping hazard the brief asks it to avoid.
  ['A: ended by done', (l) => (l.condition === 'A' ? l.outcome === 'ended' : null)],
  ['A: mail names a clock, no times listed', (l) => (l.condition === 'A' ? l.actions.some((a) => a.raw?.tool === 'mail_send' && !(Array.isArray(a.raw.args['times']) && a.raw.args['times'].length) && namesAClock(String(a.raw.args['body'] ?? ''))) : null)],
  ['A: unreadable or invalid calls', (l) => (l.condition === 'A' ? l.steps.some((s) => s.unreadable || /^\{"error"/.test(s.result)) : null)],
];

/** k/n [lo-hi] over the lines where the metric applies (null: not applicable, left out of n); blank when none apply. */
function cell(ls: RunLine[], f: (l: RunLine) => boolean | null): string {
  const v = ls.map(f).filter((x): x is boolean => x !== null);
  if (!v.length) return '';
  const k = v.filter(Boolean).length; const [lo, hi] = wilson(k, v.length);
  return `${k}/${v.length} [${lo.toFixed(2)}-${hi.toFixed(2)}]`;
}

function render(head: string[], rows: string[][]): string {
  const all = [head, ...rows];
  const w = head.map((_, i) => Math.max(...all.map((r) => (r[i] ?? '').length)));
  return all.map((r, j) => `${r.map((c, i) => (c ?? '').padEnd(w[i]!)).join(' | ')}${j === 0 ? `\n${w.map((x) => '-'.repeat(x)).join('-|-')}` : ''}`).join('\n');
}

export function table(lines: RunLine[], by: By = 'scenario'): string {
  const groups = new Map<string, RunLine[]>();
  for (const l of lines) { const k = groupKey(l, by); groups.set(k, [...(groups.get(k) ?? []), l]); }
  const keys = [...groups.keys()].sort();
  const judged = lines.some((l) => l.judge);
  const metrics: Metric[] = [...METRICS, ...(judged ? P_KEYS.map((k): Metric => [`${k} ${P_DEFINITIONS[k].split('.')[0]!.toLowerCase()}`, (l) => pFired(l, k)]) : [])];
  const rows = metrics.map(([name, f]) => [name, ...keys.map((k) => cell(groups.get(k)!, f))]);
  const avg = (ls: RunLine[], f: (l: RunLine) => number): number => ls.reduce((n, l) => n + f(l), 0) / Math.max(ls.length, 1);
  rows.push(['n lines', ...keys.map((k) => String(groups.get(k)!.length))]);
  rows.push(['mean steps', ...keys.map((k) => avg(groups.get(k)!, (l) => l.steps.length).toFixed(2))]);
  rows.push(['mean tokens in/out', ...keys.map((k) => `${Math.round(avg(groups.get(k)!, (l) => l.tokens.in))}/${Math.round(avg(groups.get(k)!, (l) => l.tokens.out))}`)]);
  rows.push(['mean wall s', ...keys.map((k) => (avg(groups.get(k)!, (l) => l.wallMs) / 1000).toFixed(1))]);
  rows.push(['cost USD (total)', ...keys.map((k) => groups.get(k)!.reduce((n, l) => n + l.costUsd, 0).toFixed(4))]);
  if (judged) rows.push(['judge cost USD', ...keys.map((k) => groups.get(k)!.reduce((n, l) => n + (l.judge?.costUsd ?? 0), 0).toFixed(4))]);
  return render(['metric', ...keys], rows);
}

/**
 * V7 BY EVENT INDEX (H4): per event index, the V7 rate over the lines with a constraint in force at that event, one
 * column per condition and model. Empty when no scenario states a constraint.
 */
export function v7ByEvent(lines: RunLine[]): string {
  const inForce = lines.filter((l) => l.graders.V7?.inForce?.length);
  if (!inForce.length) return '(no line has a constraint in force: no scenario states expect.constraints yet)';
  const cols = [...new Set(inForce.map((l) => `${l.condition} ${l.model}`))].sort();
  const idx = [...new Set(inForce.map((l) => l.eventIndex))].sort((a, b) => a - b);
  const rows = idx.map((i) => [`event ${i}`, ...cols.map((c) => cell(inForce.filter((l) => l.eventIndex === i && `${l.condition} ${l.model}` === c), (l) => l.graders.V7.fired))]);
  return render(['V7 by event index', ...cols], rows);
}

export function readLines(targets: string[]): { lines: RunLine[]; files: string[] } {
  const fs_ = files(targets);
  return { files: fs_, lines: fs_.flatMap((f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => { const x = JSON.parse(l) as RunLine; return { ...x, condition: conditionOf(x) }; })) };
}

/** Every judged file by the rubric its judge blocks carry ("prose-rubric-3 <hash>"); a file with two shows under both. */
export function rubricVersions(fs_: readonly string[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const f of fs_) {
    const seen = new Set<string>();
    for (const raw of fs.readFileSync(f, 'utf8').split('\n').filter(Boolean)) {
      const j = (JSON.parse(raw) as RunLine).judge;
      if (j) seen.add(`${j.rubricVersion} ${j.rubricHash}`);
    }
    for (const v of seen) out.set(v, [...(out.get(v) ?? []), f]);
  }
  return out;
}

/** null when the judged files agree on one rubric (or none is judged); else the refusal, naming each file under its version. */
export function mixedRubrics(versions: ReadonlyMap<string, readonly string[]>): string | null {
  if (versions.size <= 1) return null;
  return [`REFUSED: the judged files carry ${versions.size} prose rubrics, and P1..P4 from two rubrics never pool. Summarize each set on its own:`,
    ...[...versions].sort(([a], [b]) => a.localeCompare(b)).flatMap(([v, fs_]) => [`  ${v} (${fs_.length} file(s)):`, ...fs_.map((f) => `    ${path.relative(REPO_ROOT, f)}`)])].join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const args = process.argv.slice(2);
  const by = (args.find((a) => a.startsWith('--by='))?.slice(5) ?? 'scenario') as By;
  if (!['scenario', 'condition', 'model'].includes(by)) { console.error(`--by must be scenario, condition or model, not ${by}`); process.exit(2); }
  const stored = args.includes('--stored');
  const { lines: raw, files: fs_ } = readLines(args.filter((a) => !a.startsWith('--')));
  if (raw.length === 0) { console.log('no runs found'); process.exit(0); }
  const versions = rubricVersions(fs_);
  const mixed = mixedRubrics(versions);
  if (mixed) { console.error(mixed); process.exit(2); }
  const failed: string[] = [];
  const lines = stored ? raw : raw.map((l) => { const r = regraded(l); if (r.error) failed.push(`${l.scenario} e${l.eventIndex} ${l.condition}: ${r.error}`); return r.line; });
  console.log(`${lines.length} run(s) from ${fs_.length} file(s), ${stored ? 'stored grades' : 're-graded with the current graders and expectations'}, --by=${by}; cells are k/n [95% Wilson interval], n = lines where the metric applies\n`);
  for (const [v, vf] of versions) console.log(`prose judge: rubric ${v} in ${vf.length} judged file(s)\n`);
  if (failed.length) console.log(`RE-GRADE FAILED on ${failed.length} line(s), stored grades used:\n  ${[...new Set(failed)].join('\n  ')}\n`);
  console.log(table(lines, by));
  console.log(`\n${v7ByEvent(lines)}`);
}
