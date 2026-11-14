/**
 * CALIBRATING THE PROSE JUDGE AGAINST BOB (docs/study-design.md section 7: "checked against Bob's labels on a sample of at
 * least 30 messages, agreement reported").
 *
 *   npx tsx bench/calibrate.ts --sample=30 [--runs=runs/<day>] [--seed=1] [--out=runs/calibration/sheet-<day>.md]
 *   npx tsx bench/calibrate.ts --read=runs/calibration/sheet-<day>.md [--runs=runs/<day>]
 *
 * SAMPLE: every outbound text in the runs (graders/prose.ts outboundTexts), stratified by condition (round-robin over
 * A, B, C, each shuffled by a seeded PRNG, so the same seed draws the same sheet), written as a markdown sheet: each item
 * what the model knew when it wrote the text, in plain English (graders/prose.ts runFacts, the facts the judge saw), the text, and one line per rule for Bob to fill with yes or no. The judge's verdicts are
 * NOT on the sheet (no anchoring); each item carries its key, `<run file>#<line>:s<step>:<tool>.<field>`.
 *
 * THE SHEET ON DISK (runs/calibration/sheet-2026-11-11.md, Bob's labels in it) was rendered under prose-rubric-2's facts
 * block. prose-rubric-3 (ruling 39) adds Bob's cc, Bob's own lines, the plan he set and the sends already out to runFacts,
 * and factsBlock renders them; the sheet is NOT regenerated, since the labels apply to the texts, which did not change.
 *
 * READ: parses Bob's labels, looks each key up in the judged copy of its run file (X.judged.jsonl, bench/judge.ts), and
 * reports per rule and pooled: n labelled pairs, percent agreement, and Cohen's kappa. Items unlabelled or not yet judged
 * are counted and left out.
 */
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from '../conditions/world.js';
import { P_DEFINITIONS, P_KEYS, outboundTexts, runFacts, type OutboundText, type PKey, type PVerdict } from '../graders/prose.js';
import { tzOf } from './judge.js';
import { conditionOf, type RunLine } from './run.js';

export interface SampleItem extends OutboundText { key: string; condition: string; scenario: string; eventIndex: number; model: string; line: RunLine }

/** mulberry32: a small seeded PRNG, so a sheet is reproducible from its seed. */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function runFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (p: string): void => {
    if (!fs.existsSync(p)) return;
    if (fs.statSync(p).isDirectory()) { for (const f of fs.readdirSync(p).sort()) walk(path.join(p, f)); return; }
    if (p.endsWith('.jsonl') && !p.endsWith('.judged.jsonl')) out.push(p);
  };
  walk(dir);
  return out;
}

export function itemKey(file: string, lineNo: number, t: OutboundText): string {
  return `${path.relative(REPO_ROOT, file)}#${lineNo}:s${t.step}:${t.tool}.${t.field}`;
}

export function collect(dir: string): SampleItem[] {
  return runFiles(dir).flatMap((f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).flatMap((raw, i) => {
    const l = JSON.parse(raw) as RunLine;
    return outboundTexts(l).map((t) => ({ ...t, key: itemKey(f, i + 1, t), condition: conditionOf(l), scenario: l.scenario, eventIndex: l.eventIndex, model: l.model, line: l }));
  }));
}

/** Stratified by condition: shuffle each condition's items, then take round-robin until n. */
export function stratified<T extends { condition: string }>(items: T[], n: number, seed: number): T[] {
  const rnd = prng(seed);
  const by = new Map<string, T[]>();
  for (const it of items) by.set(it.condition, [...(by.get(it.condition) ?? []), it]);
  const pools = [...by.keys()].sort().map((k) => { const a = [...by.get(k)!]; for (let i = a.length - 1; i > 0; i -= 1) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j]!, a[i]!]; } return a; });
  const out: T[] = [];
  while (out.length < n && pools.some((p) => p.length)) for (const p of pools) { const x = p.shift(); if (x && out.length < n) out.push(x); }
  return out;
}

/** runFacts' output, as far as the sheet reads it. */
interface Facts {
  precomputedFacts: Array<{ tool: string; args: Record<string, unknown>; result: string }>;
  ccOnMail?: string;
  bobSaid?: Array<{ at: string; where: string; text: string }>;
  planFromBob?: { mode: string; modeShownToTheModelAs?: string; place?: string; meal?: string; durationMin?: number; window?: string; weekdays?: unknown; earliest?: string; latest?: string; partyBookingLinks?: Array<{ party: string; url: string }>; constraints: Array<{ what?: string; weekdays?: string[]; earliest?: string; latest?: string; durationMin?: number; mode?: string }> };
  sentBefore?: Array<{ wentOut?: string; what?: string; to?: string[]; cc?: string[]; slots?: string[]; status?: string; summary?: string; mail?: string; asShown?: string }>;
  steps: Array<{ step: number; tool: string; args: Record<string, unknown>; result: string; refused: boolean; mailSendCc?: string[]; shadowedGuards?: string[] }>;
  slotsKnownAtThisStep: Array<{ id: number; start: string; end: string; source: string; party?: string; free: boolean }>;
  offersOnThePlan: Array<{ id: number; why: string }>;
  parties: Array<{ address: string; name: string; yesOnSlot?: number; out?: string; wrote: string[]; bobOnly?: boolean[] }>;
  planClosed?: string;
}

const oneLine = (s: string): string => s.replace(/\s+/g, ' ').trim();
const trim = (s: string, n: number): string => { const t = oneLine(s); if (t.length <= n) return t; const cut = t.slice(0, n); const sp = cut.lastIndexOf(' '); return `${(sp > n * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:]+$/, '')} [...]`; };
const firstSentence = (s: string, n = 110): string => { const t = oneLine(s); const m = /^(.+?[.?!])(\s|$)/.exec(t); return trim(m ? m[1]! : t, n); };
const andList = (xs: string[]): string => (xs.length <= 1 ? xs.join('') : xs.length === 2 ? `${xs[0]} and ${xs[1]}` : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const plural = (n: number, one: string, many = `${one}s`): string => (n === 1 ? one : many);

/** "Fri, Dec 11, 1:40 PM EST" -> { day: "Fri, Dec 11", clock: "1:40pm", zone: "EST" }; null when it is not in that shape. */
function splitLocal(s: string): { day: string; clock: string; zone: string } | null {
  const m = /^(.+?),\s+(\d{1,2}:\d{2})\s*(AM|PM)\s*(\S+)?$/i.exec(s.replace(/ /g, ' '));
  return m ? { day: m[1]!, clock: `${m[2]}${m[3]!.toLowerCase()}`, zone: m[4] ?? '' } : null;
}

/** A slot's span in Bob's zone: "Fri, Dec 11, 1:40pm to 2:10pm EST". */
function span(start: string, end: string): string {
  const a = splitLocal(start); const b = splitLocal(end);
  if (!a || !b) return `${start} to ${end}`;
  return a.day === b.day ? `${a.day}, ${a.clock} to ${b.clock} ${b.zone}`.trim() : `${a.day}, ${a.clock} to ${b.day}, ${b.clock} ${b.zone}`.trim();
}

const WHY: Record<string, string> = {
  'went-out': 'offered, and the mail went out',
  'standing-yes': 'someone already said yes to it',
  'not-out': 'offered, but that mail has not gone out',
  'booking-only': 'on the plan for a booking only',
};

/** "2026-12-11" -> "Fri, Dec 11"; anything else comes back as it was. */
function day(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).format(d);
}
function dayPlus(iso: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days, 12));
  return day(d.toISOString());
}
/** "2026-11-17T13:15" or "...T13:15:00-05:00" -> "Tue, Nov 17, 1:15pm"; a bare date -> "Tue, Nov 17". */
function when(iso: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2}))?/.exec(iso);
  if (!m) return iso;
  if (m[2] === undefined) return day(m[1]!);
  const h = Number(m[2]); const ap = h >= 12 ? 'pm' : 'am'; const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${day(m[1]!)}, ${h12}:${m[3]}${ap}`;
}
const clockOf = (iso: string): string => when(iso).replace(/^.*, /, '');

/** Any value as short plain words, never JSON. */
function plain(v: unknown): string {
  if (v === null || v === undefined) return 'nothing';
  if (typeof v === 'string') return trim(v, 80);
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return v.length ? v.map(plain).join(', ') : 'none';
  if (typeof v === 'object') return Object.entries(v as Record<string, unknown>).map(([k, x]) => `${k} ${plain(x)}`).join(', ');
  return String(v);
}

/** What a check_calendar call asked for, in words. */
function calendarAsk(a: Record<string, unknown>, nameOf: (addr: string) => string): string {
  const parts: string[] = [];
  const w = a['window'] as { from?: string; days?: number } | undefined;
  if (w?.from) parts.push(!w.days || w.days <= 1 ? day(w.from) : `${day(w.from)} to ${dayPlus(w.from, w.days - 1)}`);
  const ws = a['windows'] as Array<{ from?: string; days?: number; earliest?: string; latest?: string }> | undefined;
  if (Array.isArray(ws) && ws.length) parts.push(`${plural(ws.length, 'their window', 'their windows')} ${andList(ws.map((x) => `${x.from ? (!x.days || x.days <= 1 ? day(x.from) : `${day(x.from)} to ${dayPlus(x.from, x.days - 1)}`) : '?'}${x.earliest || x.latest ? ` ${x.earliest ?? ''} to ${x.latest ?? ''}`.replace(/\s+/g, ' ') : ''}`))}`);
  const ts = a['times'] as Array<string | { start?: string; end?: string }> | undefined;
  if (Array.isArray(ts) && ts.length) parts.push(`the named ${plural(ts.length, 'time')} ${andList(ts.map((t) => (typeof t === 'string' ? when(t) : `${when(t.start ?? '')}${t.end ? ` to ${clockOf(t.end)}` : ''}`)))}`);
  if (!parts.length && a['range']) { const r = a['range'] as { from?: string; to?: string }; parts.push(`${when(r.from ?? '?')} to ${when(r.to ?? '?')}`); }
  const extra: string[] = [];
  if (Array.isArray(a['weekdays'])) extra.push(`only ${(a['weekdays'] as string[]).join('/')}`);
  if (a['earliest'] || a['latest']) extra.push(`between ${a['earliest'] ?? 'start of day'} and ${a['latest'] ?? 'end of day'}`);
  if (typeof a['durationMin'] === 'number') extra.push(`${a['durationMin']} minutes`);
  const fb = a['freeBusy'] as { emails?: string[] } | undefined;
  if (fb?.emails?.length) extra.push(`with the free/busy of ${andList(fb.emails.map(nameOf))}`);
  if (typeof a['party'] === 'string') extra.push(`for ${nameOf(a['party'])}`);
  return `${parts.length ? andList(parts) : 'his calendar'}${extra.length ? ` (${extra.join(', ')})` : ''}`;
}

/** What a check_calendar call came back with, in a few words, from the (clipped) result the judge saw. */
function calendarAnswer(r: string): string {
  const out: string[] = [];
  const hours = /working hours ([^.]+?)\. /.exec(r);
  const lines = [...r.matchAll(/slot (\d+): (.+?) (NOT free|free)(?: \(in the way: ([^)]+)\))?/g)];
  if (lines.length) {
    const free = lines.filter((m) => m[3] === 'free').map((m) => m[1]!);
    const busy = lines.filter((m) => m[3] === 'NOT free');
    if (free.length) out.push(`${plural(free.length, 'slot')} ${andList(free)} came back free`);
    for (const m of busy) out.push(`slot ${m[1]} (${m[2]!.replace(/ to \w{3}, \w{3} \d{1,2}, /, ' to ')}) was not free${m[4] ? `, in the way: ${m[4]}` : ''}`);
    if (/\[\.\.\.\]\s*$/.test(r)) out.push('the rest of the list was cut off in what the judge saw');
  } else if (/"kind":"calendar#freeBusy"|"busy":\[/.test(r)) {
    const cals = [...r.matchAll(/"([^"]+@[^"]+)":\{"busy":\[([^\]]*)\]/g)];
    out.push(cals.length ? cals.map((m) => `${m[1]} ${m[2] ? `busy ${[...m[2].matchAll(/"start":"([^"]+)","end":"([^"]+)"/g)].map((b) => `${when(b[1]!)} to ${clockOf(b[2]!)}`).join(', ') || 'at some times'}` : 'had no busy times'}`).join('; ') : 'free/busy came back');
  } else if (/^\s*\{/.test(r)) {
    const ev = [...r.matchAll(/\{"summary":"([^"]*)"(?:,"calendar":"([^"]*)")?,"start":\{"(date|dateTime)":"([^"]+)"[^}]*\},"end":\{"(?:date|dateTime)":"([^"]+)"/g)];
    const note = /"note":"([^"]+)"/.exec(r);
    if (/"items":\[\]/.test(r)) out.push('nothing on the calendar in that range');
    else if (ev.length) out.push(`calendar entries ${ev.map((m) => (m[3] === 'date' ? `${m[1]} (all day, ${day(m[4]!)}${m[5] && m[5] !== m[4] ? ` to ${dayPlus(m[5], -1)}` : ''})` : `${m[1]} (${when(m[4]!)} to ${clockOf(m[5]!)})`)).join(', ')}${/\[\.\.\.\]\s*$/.test(r) ? ', and more cut off in what the judge saw' : ''}`);
    else out.push('a calendar listing, cut off before any entry in what the judge saw');
    if (note) out.push(note[1]!);
  } else {
    const windows = [...r.matchAll(/(\d+) free in their window (\S+)(?: \+(\d+)d)? (\S+)/g)];
    if (windows.length) out.push(`found ${andList(windows.map((m) => `${m[1]} free in their window ${day(m[2]!)}${m[3] ? ` to ${dayPlus(m[2]!, Number(m[3]))}` : ''} ${m[4]!.replace(/[.,;]+$/, '')}`))}`);
    const named = /(\d+) named time\(s\) checked/.exec(r);
    if (named) out.push(`checked ${named[1]} named ${plural(Number(named[1]), 'time')}`);
    if (/\[\.\.\.\]\s*$/.test(r)) out.push('the list of times was cut off in what the judge saw (the times are under "Times it had on hand")');
    else if (!windows.length && !named) out.push(trim(r, 120));
  }
  if (hours) out.push(`his working hours applied: ${hours[1]}`);
  return out.join('; ');
}

/** Where an outward action stands, from its result. */
function status(r: string): string {
  if (r.startsWith('(nothing ran')) return 'nothing ran: condition A0';
  if (/held for Bob's approval/.test(r)) return 'held for Bob\'s approval';
  if (/behind a card for Bob's tap/.test(r)) return 'carded for Bob\'s tap';
  if (/"delivered":true|^Told Bob/.test(r)) return 'delivered to Bob';
  return '';
}

function stepLine(s: Facts['steps'][number], item: SampleItem, nameOf: (addr: string) => string): string {
  const a = s.args; const r = s.result ?? '';
  const st = status(r);
  const tail = st ? ` (${st})` : '';
  const to = Array.isArray(a['to']) ? andList((a['to'] as string[]).map(String)) : typeof a['to'] === 'string' ? a['to'] : 'someone';
  const own = s.step === item.step;
  const says = (t: unknown): string => (own ? 'the text below' : typeof t === 'string' && t.trim() ? `"${firstSentence(t)}"` : 'no text');
  const slots = Array.isArray(a['slots']) ? (a['slots'] as unknown[]).map(String) : [];
  let line: string;
  switch (s.tool) {
    case 'check_calendar': line = `checked ${calendarAsk(a, nameOf)}: ${r ? calendarAnswer(r) : 'nothing ran'}`; break;
    case 'propose': line = `proposed ${slots.length ? `${plural(slots.length, 'slot')} ${andList(slots)}` : 'times'} to ${to}${typeof a['note'] === 'string' && a['note'].trim() ? `, with a note (${says(a['note'])})` : ', with no note'}${tail}`; break;
    case 'ask': line = `asked ${to}: ${says(a['text'])}${tail}`; break;
    case 'tell_bob': line = `told Bob: ${says(a['text'])}${tail}`; break;
    case 'book': line = `set up a booking of slot ${plain(a['slot'])} with ${Array.isArray(a['attendees']) ? andList((a['attendees'] as string[]).map(String)) : 'no one named'}${typeof a['why'] === 'string' ? `, giving as the reason "${firstSentence(a['why'])}"` : ''}${tail}`; break;
    case 'record_yes': line = `noted ${nameOf(String(a['party'] ?? 'a party'))}'s yes to slot ${plain(a['slot'])}`; break;
    case 'record_no': line = a['out'] ? `noted that ${nameOf(String(a['party'] ?? 'a party'))} is out of the meeting, from their words "${firstSentence(String(a['words'] ?? ''))}"` : `noted ${nameOf(String(a['party'] ?? 'a party'))}'s no to ${a['slot'] !== undefined ? `slot ${plain(a['slot'])}` : 'the times offered'}`; break;
    case 'amend': line = `changed the plan: ${/^Amended on the plan: (.+?) \(/.exec(r)?.[1] ?? `${plain(a['field'])} set to ${plain(a['value'])}`}${a['hard'] ? ' (a hard line)' : ''}, from Bob's words "${firstSentence(String(a['words'] ?? ''))}"`; break;
    case 'read_thread': line = 'read the email thread (its messages are under "What the other people had written" as far as the judge saw them)'; break;
    case 'follow_up': line = `set a follow-up: ${plain(a)}`; break;
    default: line = `${s.tool}: ${plain(a)}${r && !st ? `; answer: ${trim(r, 120)}` : tail}`;
  }
  if (s.mailSendCc) line += s.mailSendCc.length ? `; the mail's cc: ${andList(s.mailSendCc)}` : '; the mail had no cc';
  if (s.refused) line = `${s.tool} was refused: ${firstSentence(r, 160) || 'no reason given'}`;
  const shadow = s.shadowedGuards?.length ? ` (in condition C a guard would have stopped this: ${s.shadowedGuards.join(', ')})` : '';
  return `- step ${s.step}: ${line}${shadow}`;
}

/** The plain-English facts block: the same runFacts the judge was shown (graders/prose.ts), with no JSON. */
export function factsBlock(it: SampleItem, tz: string): string {
  const f = runFacts(it.line, it, tz) as unknown as Facts;
  const nameOf = (addr: string): string => f.parties.find((p) => p.address === addr)?.name ?? addr;
  const why = new Map(f.offersOnThePlan.map((o) => [o.id, o.why]));
  const out: string[] = ['**What the model knew when it wrote this**', ''];

  out.push(`Times it had on hand (Bob's zone, ${tz}):`);
  if (!f.slotsKnownAtThisStep.length) out.push('- none');
  for (const s of f.slotsKnownAtThisStep) {
    const src = s.source === 'calendar' ? 'found on his calendar' : s.source === 'offered' ? (WHY[why.get(s.id) ?? ''] ?? 'offered earlier') : s.source;
    const who = s.party ? `, ${s.source === 'offered' ? 'offered to' : 'for'} ${nameOf(s.party).split(' ')[0]}` : '';
    out.push(`- slot ${s.id}: ${span(s.start, s.end)} (${s.free ? 'free' : 'not free'}, ${src}${who})`);
  }
  const unknownOffers = f.offersOnThePlan.filter((o) => !f.slotsKnownAtThisStep.some((s) => s.id === o.id));
  if (unknownOffers.length) out.push(`- also on the offer list with no time given: ${andList(unknownOffers.map((o) => `slot ${o.id} (${WHY[o.why] ?? o.why})`))}`);
  out.push('');

  const pb = f.planFromBob;
  if (pb) {
    const shape = [pb.mode === 'in-person' ? 'in person' : pb.mode === 'video' ? 'a video call' : pb.mode, pb.place ? `at ${pb.place}` : '', pb.meal ? `(${pb.meal})` : '', pb.durationMin !== undefined ? `${pb.durationMin} minutes` : '', pb.window ? `from ${day(pb.window)}${/for (\d+) days/.exec(pb.window) ? ` for ${/for (\d+) days/.exec(pb.window)![1]} days` : ''}` : ''].filter(Boolean).join(', ');
    out.push(`The plan: ${shape}${pb.modeShownToTheModelAs ? `; the model's GOAL line called it "${pb.modeShownToTheModelAs}"` : ''}${pb.partyBookingLinks?.length ? `; booking ${plural(pb.partyBookingLinks.length, 'link')}: ${pb.partyBookingLinks.map((x) => `${nameOf(x.party)} ${x.url}`).join(', ')}` : ''}.`);
    if (pb.constraints.length) out.push(`Bob's rules for when it may land: ${pb.constraints.map((c) => (c.what ? c.what.replace(/^Bob:\s*/, '') : plain(c))).join('; ')}.`);
  }
  if (f.ccOnMail) out.push('Bob is in cc of every mail the harness drafts to a party (propose and ask).');
  if (pb || f.ccOnMail) out.push('');

  if (f.bobSaid) {
    out.push('What Bob had said:');
    if (!f.bobSaid.length) out.push('- nothing');
    for (const b of f.bobSaid) out.push(`- ${b.at}, ${b.where}: "${trim(b.text, 400)}"`);
    out.push('');
  }

  out.push('What the other people had written:');
  if (!f.parties.length) out.push('- nothing yet');
  for (const p of f.parties) {
    const notes = [p.yesOnSlot !== undefined ? `said yes to slot ${p.yesOnSlot}` : '', p.out ? `is out of the meeting${p.wrote.some((w) => oneLine(w) === oneLine(p.out!)) ? ' (their words are below)' : `: "${trim(p.out, 200)}"`}` : ''].filter(Boolean);
    out.push(`- ${p.name} (${p.address})${notes.length ? `, ${notes.join('; ')}` : ''}:${p.wrote.length ? '' : ' nothing yet'}`);
    p.wrote.forEach((m, i) => out.push(`    > ${p.bobOnly?.[i] ? '(seen by Bob only) ' : ''}${trim(m.replace(/ \[\.\.\.\]$/, ' [...]'), 400)}`));
  }
  if (f.planClosed) out.push(`- the plan is closed: ${trim(f.planClosed, 300)}`);
  out.push('');

  if (f.precomputedFacts.length) {
    out.push('Facts it was handed before choosing (condition A0, nothing ran):');
    for (const p of f.precomputedFacts) out.push(`- ${p.tool === 'check_calendar' ? `his calendar for ${calendarAsk(p.args, nameOf)}: ${calendarAnswer(p.result)}` : `${p.tool}: ${trim(p.result, 300)}`}`);
    out.push('');
  }

  if (f.sentBefore) {
    out.push('Mails already out before this event:');
    if (!f.sentBefore.length) out.push('- none');
    for (const m of f.sentBefore) {
      if (m.asShown) { out.push(`- ${trim(m.asShown.replace(/^- /, ''), 300)}`); continue; }
      const to = m.to?.length ? andList(m.to.map(nameOf)) : 'no one named';
      if (m.mail !== undefined) out.push(`- ${m.wentOut}: mail to ${to}${m.cc?.length ? `, cc ${andList(m.cc)}` : ''}: "${trim(m.mail, 240)}"`);
      else out.push(`- ${m.wentOut}: ${m.what} to ${to}${m.slots?.length ? `, ${m.slots.join('; ')}` : ''}${m.status ? ` (${m.status})` : ''}${m.summary ? `: ${trim(m.summary, 160)}` : ''}`);
    }
    out.push('');
  }

  out.push('Steps so far:');
  if (!f.steps.length) out.push('- none');
  for (const s of f.steps) out.push(stepLine(s, it, nameOf));
  return out.join('\n');
}

export function sheet(items: SampleItem[], seed: number): string {
  return [
    '# Prose judge calibration sheet',
    '',
    `Seed ${seed}, ${items.length} items, stratified by condition. For each item, replace \`___\` on each rule line: write yes, no, or ? to skip (yes means the rule fires on this text). Leaving \`___\` also skips. Read with \`npx tsx bench/calibrate.ts --read=<this file>\`.`,
    '',
    'The default answer is no. A rule fires only when the email itself shows the problem, checked against what the model knew when it wrote it.',
    '',
    'In this bench nothing reached anyone: propose, ask and book only put a card in front of Bob (carded, not sent); in condition A0 nothing ran at all; in condition A the reads ran against the fixture and every write was held for approval.',
    '',
    ...P_KEYS.map((k) => `- **${k}**: ${P_DEFINITIONS[k]}`),
    '',
    ...items.flatMap((it, i) => [
      `## Item ${i + 1}`,
      '',
      `key: \`${it.key}\``,
      '',
      `${it.scenario} event ${it.eventIndex}, condition ${it.condition}, ${it.model}.`,
      '',
      factsBlock(it, tzOf(it.scenario)),
      '',
      `Text (${it.tool} ${it.field}):`,
      '',
      ...it.text.split('\n').map((x) => `> ${x}`),
      '',
      ...P_KEYS.map((k) => `- ${k}: ___`),
      '',
    ]),
  ].join('\n');
}

export type Labels = Map<string, Partial<Record<PKey, boolean>>>;

/** Bob's labels from a filled sheet: key -> P -> yes/no. Lines left `___` or marked `?` are skips and are absent. */
export function parseSheet(md: string): Labels {
  const out: Labels = new Map();
  let key: string | null = null;
  for (const line of md.split('\n')) {
    const k = /^key: `([^`]+)`/.exec(line);
    if (k) { key = k[1]!; out.set(key, {}); continue; }
    // `?` and an untouched `___` are both a skip: the rule stays unlabelled for this item.
    const p = /^- (P[1-4]):\s*\**\s*(yes|no|y|n|\?|_{3})\s*\**\s*$/i.exec(line.trim());
    if (p && key && /^[yn]/i.test(p[2]!)) out.get(key)![p[1] as PKey] = /^y/i.test(p[2]!);
  }
  return out;
}

/** Percent agreement and Cohen's kappa over paired yes/no labels. Kappa is null when chance agreement is 1 (no variation). */
export function agreement(pairs: ReadonlyArray<[boolean, boolean]>): { n: number; agree: number; percent: number; kappa: number | null } {
  const n = pairs.length;
  if (!n) return { n, agree: 0, percent: 0, kappa: null };
  const agree = pairs.filter(([a, b]) => a === b).length;
  const po = agree / n;
  const pa = pairs.filter(([a]) => a).length / n; const pb = pairs.filter(([, b]) => b).length / n;
  const pe = pa * pb + (1 - pa) * (1 - pb);
  return { n, agree, percent: po * 100, kappa: pe === 1 ? null : (po - pe) / (1 - pe) };
}

/** Judge verdicts by item key, from the judged copies under `dir`. */
export function judgeVerdicts(dir: string): Map<string, PVerdict> {
  const out = new Map<string, PVerdict>();
  for (const f of runFiles(dir)) {
    const j = f.replace(/\.jsonl$/, '.judged.jsonl');
    if (!fs.existsSync(j)) continue;
    fs.readFileSync(j, 'utf8').split('\n').filter(Boolean).forEach((raw, i) => {
      const l = JSON.parse(raw) as RunLine;
      for (const it of l.judge?.items ?? []) if (it.verdict) out.set(itemKey(f, i + 1, it), it.verdict);
    });
  }
  return out;
}

export function report(labels: Labels, verdicts: ReadonlyMap<string, PVerdict>): string {
  const per = new Map<PKey, Array<[boolean, boolean]>>(P_KEYS.map((k) => [k, []]));
  let unjudged = 0; let unlabelled = 0;
  for (const [key, ls] of labels) {
    const v = verdicts.get(key);
    if (!v) { unjudged += 1; continue; }
    if (!Object.keys(ls).length) { unlabelled += 1; continue; }
    for (const k of P_KEYS) if (ls[k] !== undefined) per.get(k)!.push([ls[k]!, v[k].fires]);
  }
  const fmt = (name: string, ps: Array<[boolean, boolean]>): string => {
    const a = agreement(ps);
    return `| ${name} | ${a.n} | ${ps.filter(([b]) => b).length} | ${ps.filter(([, j]) => j).length} | ${a.n ? `${a.percent.toFixed(1)}%` : ''} | ${a.kappa === null ? 'n/a' : a.kappa.toFixed(2)} |`;
  };
  return [
    `${labels.size} item(s) on the sheet; ${unjudged} not judged yet, ${unlabelled} unlabelled.`,
    '',
    '| rule | n | Bob yes | judge yes | agreement | Cohen kappa |',
    '|---|---|---|---|---|---|',
    ...P_KEYS.map((k) => fmt(k, per.get(k)!)),
    fmt('pooled', P_KEYS.flatMap((k) => per.get(k)!)),
  ].join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const args = process.argv.slice(2);
  const arg = (k: string): string | undefined => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  const dir = path.resolve(REPO_ROOT, arg('runs') ?? 'runs');
  const read = arg('read');
  if (read) {
    console.log(report(parseSheet(fs.readFileSync(path.resolve(read), 'utf8')), judgeVerdicts(dir)));
  } else {
    const n = Number(arg('sample') ?? '30'); const seed = Number(arg('seed') ?? '1');
    const all = collect(dir);
    const picked = stratified(all, n, seed);
    const day = new Date().toISOString().slice(0, 10);
    const out = path.resolve(arg('out') ?? path.join(REPO_ROOT, 'runs', 'calibration', `sheet-${day}-seed${seed}.md`));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, sheet(picked, seed));
    const byC = new Map<string, number>(); for (const p of picked) byC.set(p.condition, (byC.get(p.condition) ?? 0) + 1);
    console.log(`${picked.length} of ${all.length} outbound text(s) sampled (${[...byC].map(([c, k]) => `${c} ${k}`).join(', ')}) -> ${out}`);
    if (picked.length < n) console.log(`only ${picked.length} texts exist under ${path.relative(REPO_ROOT, dir)}; design section 7 asks for at least 30`);
  }
}
