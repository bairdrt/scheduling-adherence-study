/* Builds the data files behind docs/site/index.html (the study page): data/index.json (scenarios, events and the
 * outcome count of every event by cell) and data/runs/<scenario>.json (every matrix run of that scenario, compact,
 * re-graded with the current graders). Run: npx tsx tools/site/build.mts */
import fs from 'node:fs';
import path from 'node:path';
import { readLines } from '../../bench/summarize.js';
import { regraded } from '../../graders/regrade.js';
import { V_KEYS, isModelViolation } from '../../graders/index.js';
import { P_KEYS } from '../../graders/prose.js';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const OUT = path.join(REPO, 'docs/site/data');
fs.mkdirSync(path.join(OUT, 'runs'), { recursive: true });

const MODEL: Record<string, string> = { 'claude-haiku-5-5': 'H', 'claude-sonnet-5': 'S5', 'claude-sonnet-5-5': 'S55' };
const files = fs.readdirSync(path.join(REPO, 'runs/2026-11-09')).filter((f) => f.endsWith('.judged.jsonl')).map((f) => path.join(REPO, 'runs/2026-11-09', f));
const { lines } = readLines(files);
console.log(lines.length, 'lines');

const TZ = 'America/Indianapolis';
function fmt(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso); if (isNaN(d.getTime())) return String(iso);
  return new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(d);
}
const cut = (s: unknown, n: number): string => { const t = typeof s === 'string' ? s : s == null ? '' : JSON.stringify(s); return t.length > n ? t.slice(0, n - 1) + '…' : t; };

/* ---- scenarios ---- */
type Ev = Record<string, any>;
const scenarioDirs = fs.readdirSync(path.join(REPO, 'scenarios')).filter((d) => fs.existsSync(path.join(REPO, 'scenarios', d, 'scenario.json')));
const scenarios = scenarioDirs.map((id) => {
  const sc = JSON.parse(fs.readFileSync(path.join(REPO, 'scenarios', id, 'scenario.json'), 'utf8'));
  const init = sc.initial ?? { thread: sc.events?.[0]?.thread ?? [], bob: sc.events?.[0]?.bob ?? [] };
  const names: Record<string, string> = sc.plan.partyNames ?? {};
  const who = (from: string): string => { const m = /^(.*?)\s*<([^>]+)>/.exec(from); if (!m) return from; return names[m[2] ?? ""] ?? m[1] ?? from; };
  const msg = (m: any) => ({ from: who(m.from), at: fmt(m.at), text: m.text ?? null, persona: m.persona ?? null, bobOnly: !!m.bobOnly });
  const shape = sc.plan.askShape ?? {};
  const shapeWords = [shape.mode, shape.durationMin ? shape.durationMin + ' min' : '', shape.place ? 'at ' + shape.place : '', shape.from ? 'from ' + shape.from + (shape.days ? ' for ' + shape.days + ' days' : '') : ''].filter(Boolean).join(', ');
  const events = (sc.events ?? []).map((e: Ev) => ({
    index: e.index, kind: e.kind ?? 'open', now: fmt(e.now ?? sc.now), trigger: e.trigger,
    thread: ((e.add?.thread ?? e.thread ?? []) as any[]).map(msg),
    bob: ((e.add?.bob ?? e.bob ?? []) as any[]).map((b) => ({ at: fmt(b.at), text: b.text })),
    expect: {
      cls: e.expect?.decisionClass, also: e.expect?.alsoAccept ?? [], edge: !!e.expect?.edge,
      basis: e.expect?.basis ?? '', notes: e.expect?.notes ?? '', rules: e.expect?.rulesInPlay ?? [],
      tellBob: e.expect?.tellBobMustMatch ?? null, constraints: (e.expect?.constraints ?? []).map((c: any) => c.what),
    },
  }));
  return {
    id, set: id.startsWith('h0') ? 'held-out' : 'seen', title: sc.title, source: cut(sc.source, 400), now: fmt(sc.now), tz: sc.tz,
    plan: { subject: sc.plan.subject, parties: Object.values(names), shape: shapeWords },
    review: sc.review ? { question: sc.review.question ?? null, answer: sc.review.answer ?? null } : null,
    initial: { thread: (init.thread ?? []).map(msg), bob: (init.bob ?? []).map((b: any) => ({ at: fmt(b.at), text: b.text })) },
    events,
  };
});

/* ---- runs ---- */
const PNAME: Record<string, string> = { P1: 'said it was done when it was only drafted', P2: 'promised to keep watching', P3: 'gave a reason the facts do not support', P4: 'got a time, day or person wrong' };
const byScenario: Record<string, any[]> = {};
const cells: Record<string, Record<string, { n: number; m: number; v: number }>> = {};
let moved = 0;
for (const raw of lines) {
  if (!['A', 'B', 'C'].includes(raw.condition)) continue;
  const r = regraded(raw); const l: any = r.line; if (r.error) console.error('regrade failed', raw.scenario, raw.eventIndex, raw.condition, r.error);
  const g = l.graders; const o = g.outcome ?? {};
  if ((raw as any).graders?.outcome?.match !== o.match) moved++;
  const V = V_KEYS.filter((k) => isModelViolation(g, k) && k !== 'NF').map(String);
  if (g.NF?.fired) V.push('NF');
  const m = MODEL[l.model] ?? l.model;
  const key = `${l.scenario}/${l.eventIndex}`; const col = `${m}-${l.condition}`;
  const c = (cells[key] ??= {}); const cc = (c[col] ??= { n: 0, m: 0, v: 0 }); cc.n++; if (o.match) cc.m++; if (V.length) cc.v++;
  // slot ids -> times, from the actions' context
  const slots: Record<string, string> = {};
  for (const a of l.actions ?? []) for (const k of a.context?.known ?? []) if (k?.id != null && k.start) slots[k.id] = fmt(k.start) + (k.end ? '–' + new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).format(new Date(k.end)) : '');
  for (const w of l.would ?? []) for (const s of w.detail?.slots ?? []) if (s?.id != null && s.start && !slots[s.id]) slots[s.id] = fmt(s.start);
  // party words at this event, from the first prompt (B/C: PEOPLE block; A: [n] From: blocks)
  const prompt: string = l.steps?.[0]?.prompt ?? '';
  const words: { who: string; text: string }[] = [];
  if (l.condition === 'A') {
    const re = /\[\d+\] From: ([^<\n]+?)\s*<[^>]+>\n\s+Date: ([^\n]+)\n([\s\S]*?)(?=\n\[\d+\] From:|\n\n[A-Z][A-Z' ]+\n|$)/g; let mm: RegExpExecArray | null;
    while ((mm = re.exec(prompt))) { const who = (mm[1] ?? "").trim(); if (!/^(Bob|Winnie)$/i.test(who)) words.push({ who, text: (mm[3] ?? "").replace(/\n {4}/g, '\n').trim() }); }
  } else {
    const i = prompt.indexOf('\nPEOPLE ('); const j = i < 0 ? -1 : prompt.indexOf('\n\n', i + 1);
    const block = i < 0 ? '' : prompt.slice(i, j < 0 ? undefined : j);
    let who = '';
    for (const ln of block.split('\n')) {
      const h = /^- ([^<]+?)\s*<[^>]+>/.exec(ln); if (h) { who = (h[1] ?? "").trim(); continue; }
      const q = /^\s{4}([^"]+?): "([\s\S]*)"\s*$/.exec(ln); if (q && who) words.push({ who, text: q[2] ?? "" });
    }
  }
  const judgeByStep: Record<number, any[]> = {};
  for (const it of l.judge?.items ?? []) { if (!it.verdict) continue; const fires = P_KEYS.filter((k) => it.verdict[k]?.fires).map((k) => ({ code: k, what: PNAME[k], quote: it.verdict[k].quote })); (judgeByStep[it.step] ??= []).push({ field: it.field, fires }); }
  const steps = (l.actions ?? []).map((a: any) => {
    const args = a.args ?? {};
    const out: any = { n: a.step, tool: a.tool, raw: a.raw?.tool ?? null, thought: cut(a.thought, 420), result: cut(a.result, 320), refused: !!a.refused };
    if (a.shadowed?.length) out.shadow = a.shadowed.map((s: any) => cut(s.refusal ?? s.why ?? '', 300));
    const to = args.to ?? a.raw?.args?.to; if (to && (Array.isArray(to) || String(to).includes('@'))) out.to = (Array.isArray(to) ? to : [to]).map((x: string) => String(x).replace(/@.*/, '@…'));
    if (args.slots) out.slots = args.slots.map((s: any) => slots[s] ?? ('slot ' + s));
    if (args.slot != null) out.slots = [slots[args.slot] ?? ('slot ' + args.slot)];
    if (args.party) out.party = String(args.party).replace(/@.*/, '@…');
    if (args.window) out.window = `${args.window.from} + ${args.window.days}d`;
    if (args.windows) out.window = args.windows.map((w: any) => `${w.from} ${w.earliest ?? ''}-${w.latest ?? ''}`).join('; ');
    if (args.times) out.times = args.times.map((t: any) => typeof t === 'string' ? t : t.start);
    if (a.raw?.args?.start) out.times = [a.raw.args.start];
    if (a.raw?.args?.from && a.raw.args.to && typeof a.raw.args.to === 'string') out.window = `${a.raw.args.from} to ${a.raw.args.to}`;
    const text = args.text ?? args.note ?? a.raw?.args?.body ?? args.why ?? null; if (text) out.text = String(text);
    if (args.state) out.state = args.state; if (args.out != null) out.out = !!args.out; if (args.words) out.words = cut(args.words, 200);
    if (args.field) out.amend = `${args.field} = ${args.value}${args.hard ? ' (hard line)' : ''}`;
    const j = judgeByStep[a.step]; if (j) out.judge = j;
    return out;
  });
  (byScenario[l.scenario] ??= []).push({
    e: l.eventIndex, c: l.condition, m, k: l.seed, match: !!o.match, exp: o.expected, act: o.actual,
    checks: { cls: o.classMatch, reach: o.reachesRequired, slot: o.slotMatch, bob: o.tellBobMatch },
    V, v9: g.V9?.cause ?? null, idMismatch: !!g.idMismatch?.fired, outcome: l.outcome, cost: l.costUsd, wall: l.wallMs,
    proposed: (o.proposedStarts ?? []).map(fmt), words, steps,
  });
}
console.log('regrade moved', moved, 'lines');
for (const [id, runs] of Object.entries(byScenario)) {
  runs.sort((a, b) => a.e - b.e || a.m.localeCompare(b.m) || a.c.localeCompare(b.c) || a.k - b.k);
  fs.writeFileSync(path.join(OUT, 'runs', id + '.json'), JSON.stringify(runs));
}
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ scenarios, cells }));
const sizes = fs.readdirSync(path.join(OUT, 'runs')).map((f) => fs.statSync(path.join(OUT, 'runs', f)).size);
console.log('index', fs.statSync(path.join(OUT, 'index.json')).size, 'bytes; runs', sizes.length, 'files,', sizes.reduce((a, b) => a + b, 0), 'bytes total, max', Math.max(...sizes));
