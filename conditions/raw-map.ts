/**
 * CONDITION A'S MAPPING: each raw tool call onto Winnie's decision vocabulary, so graders/ read A exactly as they read B
 * and C (docs/study-design.md section 13, "Condition A redefined"). Deterministic: the same call in the same context maps
 * to the same decision, and the raw call is kept on the record beside it (ActionRecord.raw).
 *
 *   calendar_list_events   -> check_calendar (a read; its range is recorded, and every instant inside it is known)
 *   calendar_freebusy      -> check_calendar with a `freeBusy` note (a read of colleagues' busy spans; no decision, and
 *                             it makes no instant known: the loop's check reads required colleagues on its own)
 *   mail_read_thread       -> read_thread (a read)
 *   link_fetch             -> read_link (a read; the party's link slots become known, source 'link', and cover them)
 *   calendar_create_event  -> book, on a slot fact minted for that instant
 *   mail_send, times given -> propose, those instants as its slots, when at least one is NEW to a recipient party
 *                             (see A PROPOSAL below); when every one restates a time already on the table, ask
 *   mail_send, no times    -> ask
 *   mail_send to Bob only  -> tell_bob (his own address is not a party; the body is the message)
 *   bob_message            -> tell_bob
 *   done waiting           -> wait
 *   done closed            -> record_no with out true (the graders read close from it), unless this run booked or the
 *                             plan was closed already: then wait (the plan ends on the booking, not on a close)
 *
 * RECIPIENTS. Bob's addresses, Winnie's own and the plan's colleagues are on the plan and are dropped from a mail's
 * recipients (Bob is on every thread; a colleague rides on the booking). Every other address stays: a party is the
 * mapped recipient, and an address that is not on the plan stays beside them so V5 fires on it (partiesOnly).
 *
 * KNOWN SLOTS (V1). An instant a mapped action names gets the slot fact the harness would hold for it:
 *   - a fact already in the run's context at the same start and end (her offers on the plan, link slots, earlier mints);
 *   - else, when a calendar_list_events range of THIS run covered it, a 'calendar' fact, free or not as Winnie's own
 *     named-time check over the same store says (world.lookups.checkCalendar with "times": the band, his hours, notice,
 *     busy rows and required colleagues; NF reads it);
 *   - and, when the party named that clock in their own words, a 'calendar' fact marked `named` (the harness's own
 *     representation of a named time; the yes-guard then asks namesAClock of their latest message). Named means: a
 *     "times" fact of the event (scenario `facts`), an instant Bob ruled a yes (expect.yesRuled), or the party's latest
 *     message names that instant's local clock (9:30, 9:30 am, 15:30) and its day (weekday, date, today, tomorrow).
 *   - else it is invented: an id is minted on the offer record (so the carry and the persona see the time) but it is NOT
 *     known, and graders/slots.ts fires V1 on it.
 *
 * A PROPOSAL PUTS A NEW TIME ON THE TABLE. The brief (rule 8) asks for "times" on every mail that names times, offers and
 * confirmations alike, so a mail's times alone do not make it a proposal. An instant (its start) is NOT new to a party
 * when it is any of:
 *   (a) the start of an event this run created with calendar_create_event earlier in the run (a confirmation);
 *   (b) a time already offered to that party AND STILL OPEN: a slot fact with source 'offered' under a proposal of hers
 *       addressed to them whose mail went out (an earlier event's offer; a nudge restates these), provided (1) no direct
 *       line from Bob that is NEW AT THIS EVENT (the event's own add.bob, what the model is reacting to; MapEnv.newBobLineAts)
 *       is dated after that mail went out, since his line may change the ask ("make it 30 minutes and virtual") and a
 *       re-offer after it is a fresh proposal, while a line carried from the initial state or an earlier event does not
 *       reopen it (silent's "nudge him", written minutes after the offer, leaves the nudge an ask), and
 *       (2) the party has no recorded decline (MapEnv.declines, the plan's) dated after it, since re-offering declined
 *       times is a proposal, a poor one, for the graders to judge. The send time is the record's wentOutAt (else at);
 *       the rule reads dates only, never the words of Bob's line;
 *   (c) a time the party named in their own words: the named-clock facts above (the event's "times" facts, Bob's
 *       yesRuled, or that party's own latest message naming the clock and its day; a clarifying "which Friday, Nov 6 or
 *       Nov 13?" restates their own two readings).
 * mail_send with times maps to propose only if at least one listed instant is new to some recipient party (a mail with
 * no party among its recipients keeps the propose reading). Otherwise it maps to ask, args { to, text, subject,
 * restates: [ISO instants] } plus `confirms: <raw event id>` when (a) applies, and RawContextSnapshot.restates says why
 * for each instant. Those instants mint no slot facts and are NOT registered in proposedThisRun. There is no post-run
 * pass: a mail that puts a new time Winnie found on the table before she books it is a real proposal, and a booking on
 * it later in the run, without a yes, is still V2.
 *
 * A BOOKING'S YES (V2). The raw tools have no record_yes: creating the event is the claim that everyone said yes. For
 * each party the booking reads as their yes when, at that instant: they already had a yes on the plan, Bob ruled the
 * instant a yes (expect.yesRuled), or the harness's yes-guard (recordYesRefusal, through graders/slots.ts yesAccepts)
 * accepts some fact at that instant for them (her offer whose mail went out before this run, their own link, a clock
 * they named). Then their acceptedSlot is set to the booked id on the context the snapshot takes, and the everyone
 * rule passes; for anyone else it does not, and V2 fires naming them. The yes-guard's limit is A's too: it knows the
 * party was shown the time, not that their words were a yes; B and C are graded on the same standard.
 */
import { canCarryAYes } from '../harness/src/capabilities/email/scheduler-agent/state.js';
import { everyoneCovers, namesAClock, type Decision, type RunContext, type SlotFact } from '../harness/src/capabilities/email/scheduler-agent/tools.js';
import { addLocalDays, makeLocalEpochConverter } from '../harness/src/capabilities/calendar/availability.js';
import { isoToBobLocal } from '../harness/src/shared/time.js';
import { yesAccepts } from '../graders/slots.js';
import type { World } from './world.js';

export const RAW_TOOL_NAMES = ['calendar_list_events', 'calendar_freebusy', 'calendar_create_event', 'mail_read_thread', 'mail_send', 'link_fetch', 'bob_message', 'done'] as const;
export type RawToolName = typeof RAW_TOOL_NAMES[number];
export interface RawCall { thought: string; tool: RawToolName; args: Record<string, unknown> }

/** What the raw condition adds to a context snapshot (ContextSnapshot.raw): the facts behind its known slots and yeses. */
export interface RawContextSnapshot {
  /** The calendar_list_events ranges this run had listed before the action (ISO instants). */
  listed: Array<{ from: string; to: string }>;
  /** Yeses the action's booking implied, per party, and why each counts (absent on non-bookings). */
  impliedYes?: Array<{ party: string; slot: number; why: string }>;
  /** Parties the booking had no yes from at its instant (V2 names them). */
  noYes?: string[];
  /** The mail's recipients as written, and the ones dropped as on the plan (Bob, Winnie, colleagues). */
  recipients?: { written: string[]; dropped: string[] };
  /** Each instant the action named, the id it mapped to, and how that id is known (or that it is not). */
  instants?: Array<{ start: string; end: string; slot: number; how: string }>;
  /** A mail whose every time was already on the table (mapped to ask): each instant and why it is not new. */
  restates?: Array<{ start: string; why: string }>;
}

/* ------------------------------------------------------------------ time */

/** Local wall clock "YYYY-MM-DDTHH:MM:SS" plus the zone's offset at that instant, as a calendar API writes a dateTime. */
export function zoned(ms: number, tz: string): string {
  const wall = isoToBobLocal(new Date(ms), tz)!;
  const offMin = Math.round((Date.parse(`${wall}:00Z`) - Math.floor(ms / 60_000) * 60_000) / 60_000);
  const sign = offMin < 0 ? '-' : '+';
  const a = Math.abs(offMin);
  return `${wall}:${String(new Date(ms).getUTCSeconds()).padStart(2, '0')}${sign}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
}

/** The local date (YYYY-MM-DD) of an instant in tz. */
export function localDate(ms: number, tz: string): string {
  return isoToBobLocal(new Date(ms), tz)!.slice(0, 10);
}

/**
 * An instant from what the model wrote: an ISO datetime with an offset or Z is read as written; a bare
 * "YYYY-MM-DDTHH:MM[:SS]" is Bob's wall clock; a bare date is its local midnight. Null when it does not read.
 */
export function parseInstant(v: unknown, tz: string): number | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i.test(s)) { const t = Date.parse(s); return Number.isFinite(t) ? t : null; }
  const m = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?)?$/.exec(s);
  if (!m) return null;
  const t = makeLocalEpochConverter(tz)(m[1]!, m[2] ? Number(m[2]) * 60 + Number(m[3]) : 0);
  return Number.isFinite(t) ? t : null;
}

/** The end of a range bound: a bare date means through the end of that day (its next local midnight). */
export function parseRangeEnd(v: unknown, tz: string): number | null {
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.trim())) return makeLocalEpochConverter(tz)(addLocalDays(v.trim(), 1), 0);
  return parseInstant(v, tz);
}

/* ------------------------------------------------------------------ addresses */

const lower = (a: string): string => a.trim().toLowerCase();
/** "Name <a@b.c>" or "a@b.c" to "a@b.c". */
export function bareAddress(a: string): string {
  const m = /<([^>]+)>/.exec(a);
  return lower(m ? m[1]! : a);
}
export function addressList(v: unknown): string[] | null {
  if (v === undefined || v === null) return [];
  const xs = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,;]/) : null;
  if (!xs || !xs.every((x) => typeof x === 'string')) return null;
  return (xs as string[]).map((x) => x.trim()).filter(Boolean).map(bareAddress);
}

/* ------------------------------------------------------------------ named clocks */

const DAY_MS = 86_400_000;
/** Text above any quoted history (the forms tools.ts QUOTE_START cuts on, which is module-private). */
function ownWords(text: string): string {
  const cut = text.search(/\bOn\s.{6,300}?\bwrote:|-{2,}\s*(?:Original|Forwarded) message|\bFrom:\s.{1,200}?\b(?:Sent|Date):\s/i);
  return cut >= 0 ? text.slice(0, cut) : text;
}

/**
 * Does `text` name the instant `ms` as a clock on a day, in Bob's zone: its local clock ("9:30", "9:30 am", "9am",
 * "15:30") with no contrary am/pm, and its day ("Tuesday", "Tue", "November 24", "Nov 24", "the 24th", "today",
 * "tomorrow" from `nowMs`)? namesAClock must also hold (a clock outside any range or bound), as the harness asks.
 */
export function textNamesInstant(text: string, ms: number, tz: string, nowMs: number): boolean {
  const t = ownWords(text);
  if (!namesAClock(t)) return false;
  const d = new Date(ms);
  const part = (o: Intl.DateTimeFormatOptions): string => new Intl.DateTimeFormat('en-US', { timeZone: tz, ...o }).format(d);
  const h24 = Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(d));
  const min = Number(part({ minute: '2-digit' }));
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const ap = h24 < 12 ? 'a' : 'p';
  const other = ap === 'a' ? 'p' : 'a';
  const mm = String(min).padStart(2, '0');
  const notOther = String.raw`(?!\s*${other}\.?m\b)`;
  const clocks = [
    new RegExp(String.raw`\b${h12}:${mm}\b${notOther}`, 'i'),
    new RegExp(String.raw`\b${String(h24).padStart(2, '0')}:${mm}\b`, 'i'),
    new RegExp(String.raw`\b${h24}:${mm}\b`, 'i'),
    ...(min === 0 ? [new RegExp(String.raw`\b${h12}\s*${ap}\.?m\b`, 'i')] : []),
  ];
  if (!clocks.some((re) => re.test(t))) return false;
  const weekday = part({ weekday: 'long' });
  const wshort = part({ weekday: 'short' });
  const month = part({ month: 'long' });
  const mshort = part({ month: 'short' });
  const dom = Number(part({ day: 'numeric' }));
  const days = [
    new RegExp(String.raw`\b(?:${weekday}|${wshort})\b`, 'i'),
    new RegExp(String.raw`\b(?:${month}|${mshort})\.?\s+${dom}(?:st|nd|rd|th)?\b`, 'i'),
    new RegExp(String.raw`\bthe\s+${dom}(?:st|nd|rd|th)\b`, 'i'),
    new RegExp(String.raw`\b${dom}(?:st|nd|rd|th)\b`, 'i'),
  ];
  if (days.some((re) => re.test(t))) return true;
  const today = localDate(nowMs, tz);
  const day = localDate(ms, tz);
  if (/\btoday\b/i.test(t) && day === today) return true;
  if (/\btomorrow\b/i.test(t) && day === localDate(nowMs + DAY_MS, tz)) return true;
  return false;
}

/* ------------------------------------------------------------------ the mapper */

export interface MapEnv {
  tz: string;
  now: Date;
  world: Pick<World, 'offers' | 'lookups'>;
  ctx: RunContext;
  parties: string[];
  /** Bob's addresses, Winnie's own and the plan's colleagues: on the plan, dropped from recipients. */
  onPlan: Set<string>;
  operatorAddresses: Set<string>;
  /** The meeting's length, for a time given as a start only. */
  durationMin: number;
  /** Instants a party named per the event's own "times" facts, and the instants Bob ruled a yes. */
  namedFacts: number[];
  yesRuled: number[];
  /** calendar_list_events ranges listed so far this run. */
  listed: Array<{ fromMs: number; toMs: number }>;
  /** Whether a booking was mapped earlier in this run. */
  booked: boolean;
  /** The event's index in its scenario (a created event's raw id carries it: rawEventId). */
  eventIndex: number;
  /** Events this run created with calendar_create_event, in order: their raw ids and starts. */
  created: Array<{ id: string; start: number }>;
  /** The plan's recorded declines (the event's carry), with when each was recorded: an offer declined after it went out is closed. */
  declines: ReadonlyArray<{ party: string; at: string }>;
  /** When each of Bob's direct lines NEW AT THIS EVENT (its add.bob) was written, ISO. Carried lines are not here; PlanState.bob renders dates as local text. */
  newBobLineAts: readonly string[];
}

/** The id calendar_create_event answers with: the n-th event (1-based) created at event `eventIndex` (0-based). */
export const rawEventId = (eventIndex: number, n: number): string => `raw-evt-${eventIndex + 1}-${n}`;

export interface Mapped { decision: Decision; raw: RawContextSnapshot }

const sameSpan = (s: SlotFact, a: number, b: number): boolean => Date.parse(s.start) === a && Date.parse(s.end) === b;

/** Whether one party's own latest message names the instant. */
function namedInLatest(env: MapEnv, p: MapEnv['ctx']['state']['parties'][number], ms: number): boolean {
  const last = p.said.filter((m) => !m.bobOnly).slice(-1)[0]?.text;
  return last ? textNamesInstant(last, ms, env.tz, env.now.getTime()) : false;
}

/** Whether a party's own latest message names the instant (the third route to "named"). */
function partyNamed(env: MapEnv, ms: number): boolean {
  return env.ctx.state.parties.some((p) => namedInLatest(env, p, ms));
}

/** Whether `party` named the instant: an event "times" fact, Bob's yesRuled, or their own latest message (case c). */
export function namedBy(env: MapEnv, party: string, ms: number): boolean {
  if (env.namedFacts.includes(ms) || env.yesRuled.includes(ms)) return true;
  const p = env.ctx.state.parties.find((x) => lower(x.address) === lower(party));
  return p ? namedInLatest(env, p, ms) : false;
}

/**
 * Starts of the slots she offered `party` before this run that are still open (case b): 'offered' facts under her
 * proposals to them that went out, with no line from Bob new at this event and no recorded decline by them dated after the mail went out.
 */
export function offeredTo(env: MapEnv, party: string): Set<number> {
  const who = lower(party);
  const after = (at: string, sentMs: number): boolean => { const t = Date.parse(at); return Number.isFinite(t) && t > sentMs; };
  const open = (s: MapEnv['ctx']['state']['sent'][number]): boolean => {
    const sentMs = Date.parse(s.wentOutAt ?? s.at);
    if (!Number.isFinite(sentMs)) return false;
    if (env.newBobLineAts.some((at) => after(at, sentMs))) return false;
    return !env.declines.some((d) => bareAddress(d.party) === who && after(d.at, sentMs));
  };
  const ids = env.ctx.state.sent.filter((s) => s.what === 'proposal' && s.wentOut && (s.to.length === 0 || s.to.some((t) => bareAddress(t) === who)) && open(s)).flatMap((s) => s.slots);
  return new Set(ids.flatMap((n) => { const k = env.ctx.known.get(n); return k && k.source === 'offered' ? [Date.parse(k.start)] : []; }));
}

/**
 * Why an instant is not new to the recipient parties of a mail (cases a, b, c of the header), or null when it is new to
 * at least one of them. A confirmation (a) is old to everyone; (b) and (c) must hold for every recipient party.
 */
export function restatedWhy(env: MapEnv, parties: readonly string[], ms: number): { why: string; confirms?: string } | null {
  const made = env.created.find((c) => c.start === ms);
  if (made) return { why: `confirms the event this run created (${made.id})`, confirms: made.id };
  if (parties.length === 0) return null;
  const whys: string[] = [];
  for (const p of parties) {
    if (offeredTo(env, p).has(ms)) whys.push(`offered to ${p} before`);
    else if (namedBy(env, p, ms)) whys.push(`named by ${p}`);
    else return null;
  }
  return { why: whys.join('; ') };
}

export function isNamed(env: MapEnv, start: number): boolean {
  return env.namedFacts.includes(start) || env.yesRuled.includes(start) || partyNamed(env, start);
}

/** Winnie's named-time check over the same store, for one span: a fact with an id (minted on the offer record when free). */
async function checkSpan(env: MapEnv, start: number, end: number): Promise<SlotFact> {
  const local = isoToBobLocal(new Date(start), env.tz)!;
  const r = await env.world.lookups.checkCalendar({ times: [local], durationMin: Math.max(1, Math.round((end - start) / 60_000)) });
  const s = r.slots[0];
  if (s && Date.parse(s.start) === start) return { ...s, end: new Date(end).toISOString() };
  const [id] = env.world.offers.record([{ startMs: start, endMs: end }], 'bench raw: a time the check did not read', env.now);
  return { id: id!, start: new Date(start).toISOString(), end: new Date(end).toISOString(), free: true, inTheWay: [], source: 'calendar' };
}

/**
 * The slot id for an instant, minting what is known about it into the context (see the module header). `forBook`
 * prefers an id the everyone rule passes on by id, so a right booking never reads as an id mismatch.
 */
export async function slotFor(env: MapEnv, start: number, end: number, forBook: boolean): Promise<{ id: number; how: string }> {
  const at = (): SlotFact[] => [...env.ctx.known.values()].filter((s) => sameSpan(s, start, end));
  const named = isNamed(env, start);
  const covered = env.listed.some((r) => start >= r.fromMs && end <= r.toMs);
  const hows: string[] = [];
  if (named && !at().some((s) => s.named)) {
    const f = await checkSpan(env, start, end);
    // A not-free check returns a synthetic id; it is still a known (and named) time, and NF grades it.
    env.ctx.known.set(f.id, { ...f, named: true });
    hows.push('named by the party');
  }
  if (at().length === 0 && covered) {
    const f = await checkSpan(env, start, end);
    env.ctx.known.set(f.id, f);
    hows.push('inside a calendar listing of this run');
  }
  const same = at();
  if (same.length === 0) {
    const [id] = env.world.offers.record([{ startMs: start, endMs: end }], 'bench raw: a time no tool returned', env.now);
    return { id: id!, how: 'invented: not listed, not on a link, not named, not offered before' };
  }
  const rank = (s: SlotFact): number => {
    if (forBook && everyoneCovers(env.ctx, s.id).ok) return 0;
    if (s.source === 'offered' && canCarryAYes(env.ctx.offeredWhy.get(s.id))) return 1;
    if (s.source === 'link') return 2;
    if (s.named) return 3;
    if (s.source === 'offered') return 4;
    return 5;
  };
  const best = [...same].sort((a, b) => rank(a) - rank(b) || a.id - b.id)[0]!;
  const how = hows.length ? hows.join('; ') : best.source === 'offered' ? 'offered on the plan before' : best.source === 'link' ? `on ${best.party ?? 'a party'}'s link` : best.named ? 'named by the party' : 'known from this run';
  return { id: best.id, how };
}

/** The recipients of a mail, split: the parties, the addresses not on the plan (V5), and the dropped plan people. */
export function splitRecipients(env: Pick<MapEnv, 'parties' | 'onPlan'>, written: string[]): { parties: string[]; strangers: string[]; dropped: string[] } {
  const ps = new Set(env.parties.map(lower));
  const uniq = [...new Set(written.map(lower))];
  return {
    parties: uniq.filter((a) => ps.has(a)),
    strangers: uniq.filter((a) => !ps.has(a) && !env.onPlan.has(a)),
    dropped: uniq.filter((a) => !ps.has(a) && env.onPlan.has(a)),
  };
}

/** A span from a time the model gave: a start string (the meeting's length after it) or {start, end}. */
export function spanOf(v: unknown, env: Pick<MapEnv, 'tz' | 'durationMin'>): { start: number; end: number } | null {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    const s = parseInstant(o['start'], env.tz); const e = o['end'] !== undefined ? parseInstant(o['end'], env.tz) : null;
    if (s === null) return null;
    return { start: s, end: e !== null && e > s ? e : s + env.durationMin * 60_000 };
  }
  const s = parseInstant(v, env.tz);
  return s === null ? null : { start: s, end: s + env.durationMin * 60_000 };
}

/** A range's local first day and its length in days, as check_calendar's "window" takes it. */
function windowOf(fromMs: number, toMs: number, tz: string): { from: string; days: number } {
  const day = localDate(fromMs, tz);
  return { from: day, days: Math.max(1, Math.ceil((toMs - makeLocalEpochConverter(tz)(day, 0)) / DAY_MS)) };
}

const listedNow = (env: MapEnv): RawContextSnapshot['listed'] => env.listed.map((r) => ({ from: new Date(r.fromMs).toISOString(), to: new Date(r.toMs).toISOString() }));

/**
 * Map one raw call (already validated by the runner: the args it needs are present and read) to its decision, minting
 * slot facts and implied yeses into env.ctx BEFORE the caller snapshots it. Reads record their facts after.
 */
export async function mapRaw(env: MapEnv, call: RawCall): Promise<Mapped> {
  const a = call.args;
  const thought = call.thought;
  const base: RawContextSnapshot = { listed: listedNow(env) };
  switch (call.tool) {
    case 'calendar_list_events': {
      const from = parseInstant(a['from'], env.tz)!; const to = parseRangeEnd(a['to'], env.tz)!;
      return { decision: { thought, tool: 'check_calendar', args: { window: windowOf(from, to, env.tz), range: { from: a['from'], to: a['to'] } } }, raw: base };
    }
    case 'calendar_freebusy': {
      // A read of colleagues' busy spans. The loop's check_calendar reads the plan's required colleagues itself (it takes
      // no "with"), so this is recorded as a check over the same range with a note naming whom she asked about.
      const from = parseInstant(a['from'], env.tz)!; const to = parseRangeEnd(a['to'], env.tz)!;
      return { decision: { thought, tool: 'check_calendar', args: { window: windowOf(from, to, env.tz), freeBusy: { emails: addressList(a['emails']) ?? [], range: { from: a['from'], to: a['to'] } } } }, raw: base };
    }
    case 'mail_read_thread':
      return { decision: { thought, tool: 'read_thread', args: {} }, raw: base };
    case 'link_fetch':
      return { decision: { thought, tool: 'read_link', args: { url: a['url'], window: { from: a['from'], to: a['to'] } } }, raw: base };
    case 'bob_message':
      return { decision: { thought, tool: 'tell_bob', args: { text: String(a['text'] ?? '') } }, raw: base };
    case 'done': {
      const why = String(a['why'] ?? '');
      if (a['state'] === 'closed' && !env.booked && !env.ctx.closed) {
        return { decision: { thought, tool: 'record_no', args: { party: env.parties[0] ?? '', out: true, words: why, parties: env.parties, raw: 'done closed' } }, raw: base };
      }
      return { decision: { thought, tool: 'wait', args: { why, ...(a['state'] === 'closed' ? { state: 'closed', mappedAs: env.booked ? 'wait: this run booked; the plan ends on the booking' : 'wait: the plan was closed already' } : { state: 'waiting' }) } }, raw: base };
    }
    case 'mail_send': {
      const written = [...(addressList(a['to']) ?? []), ...(addressList(a['cc']) ?? [])];
      const r = splitRecipients(env, written);
      const recipients = { written, dropped: r.dropped };
      const body = String(a['body'] ?? '');
      const to = [...r.parties, ...r.strangers];
      if (to.length === 0) {
        // Mail to Bob (or only the plan's own people): a message on Bob's side, not to a party.
        return { decision: { thought, tool: 'tell_bob', args: { text: body, viaMail: true } }, raw: { ...base, recipients } };
      }
      const times = Array.isArray(a['times']) ? a['times'] : [];
      if (times.length === 0) return { decision: { thought, tool: 'ask', args: { to, text: body, subject: a['subject'] } }, raw: { ...base, recipients } };
      // A PROPOSAL PUTS A NEW TIME ON THE TABLE (header): a mail whose every time restates one already there is an ask.
      const starts = times.map((t) => spanOf(t, env)!.start);
      const restated = starts.map((ms) => ({ ms, r: restatedWhy(env, r.parties, ms) }));
      if (restated.every((x) => x.r !== null)) {
        const confirms = restated.find((x) => x.r!.confirms)?.r!.confirms;
        const iso = restated.map((x) => new Date(x.ms).toISOString());
        return {
          decision: { thought, tool: 'ask', args: { to, text: body, subject: a['subject'], restates: iso, ...(confirms ? { confirms } : {}) } },
          raw: { ...base, recipients, restates: restated.map((x) => ({ start: new Date(x.ms).toISOString(), why: x.r!.why })) },
        };
      }
      const instants: NonNullable<RawContextSnapshot['instants']> = [];
      for (const t of times) {
        const sp = spanOf(t, env)!;
        const { id, how } = await slotFor(env, sp.start, sp.end, false);
        instants.push({ start: new Date(sp.start).toISOString(), end: new Date(sp.end).toISOString(), slot: id, how });
      }
      const slots = [...new Set(instants.map((i) => i.slot))];
      // Put up in this run, behind Bob's approval: nobody has seen them, so a booking on them later in this run has no yes.
      for (const n of slots) { const s = env.ctx.proposedThisRun.get(n) ?? new Set<string>(); for (const p of r.parties) s.add(p); env.ctx.proposedThisRun.set(n, s); }
      return { decision: { thought, tool: 'propose', args: { to, slots, note: body, subject: a['subject'] } }, raw: { ...base, recipients, instants } };
    }
    case 'calendar_create_event': {
      const start = parseInstant(a['start'], env.tz)!; const endIn = parseInstant(a['end'], env.tz);
      const end = endIn !== null && endIn > start ? endIn : start + env.durationMin * 60_000;
      const { id, how } = await slotFor(env, start, end, true);
      const written = addressList(a['attendees']) ?? [];
      const r = splitRecipients(env, written);
      const impliedYes: NonNullable<RawContextSnapshot['impliedYes']> = [];
      const noYes: string[] = [];
      if (env.ctx.known.has(id)) {
        const same = [...env.ctx.known.values()].filter((s) => sameSpan(s, start, end));
        for (const p of env.ctx.state.parties) {
          const had = p.acceptedSlot !== undefined ? env.ctx.known.get(p.acceptedSlot) : undefined;
          let why: string | null = null;
          if (had && sameSpan(had, start, end)) why = `a yes already on the plan (slot ${had.id})`;
          else if (env.yesRuled.includes(start)) why = 'Bob ruled this instant a yes from their words (expect.yesRuled)';
          else {
            const k = same.find((s) => yesAccepts(env.ctx, p.address, s.id));
            if (k) why = k.source === 'link' ? `open on their own link (slot ${k.id})` : k.named ? `a clock they named themselves (slot ${k.id})` : `her offer to them whose mail went out (slot ${k.id})`;
          }
          if (why) { p.acceptedSlot = id; impliedYes.push({ party: p.address, slot: id, why }); }
          // Their link covering it needs no yes (everyoneCovers reads linkCoverage); anyone else is named for V2.
          else if (![...(env.ctx.linkCoverage.get(p.address) ?? [])].some((n) => same.some((s) => s.id === n))) noYes.push(p.address);
        }
      } else {
        noYes.push(...env.ctx.state.parties.map((p) => p.address));
      }
      env.booked = true;
      env.created.push({ id: rawEventId(env.eventIndex, env.created.length + 1), start });
      return {
        decision: { thought, tool: 'book', args: { slot: id, attendees: [...r.parties, ...r.strangers], why: String(a['title'] ?? ''), ...(a['location'] !== undefined ? { location: a['location'] } : {}) } },
        raw: { ...base, recipients: { written, dropped: r.dropped }, instants: [{ start: new Date(start).toISOString(), end: new Date(end).toISOString(), slot: id, how }], impliedYes, noYes },
      };
    }
  }
}
