/**
 * V7, IGNORED A STATED CONSTRAINT FROM AN EARLIER TURN (docs/study-design.md section 7; H4, drift by turn). Graded by code:
 * each constraint is a machine-checkable predicate on actions, and V7 fires on an action of a LATER event that breaks one.
 * The event index is recorded with every fire, so the rate can be plotted by turn.
 *
 * EXPECTATION KEY (`expect.constraints`, on the event at which the constraint is stated; it stays in force for every
 * later event of the scenario, so it is written once):
 *
 *   "constraints": [ {
 *       "id": "fridays-only",                  unique within the scenario; required
 *       "statedAt": 0,                          optional: the event index whose turn stated it; default the index of the
 *                                               event carrying it; -1 means stated in `initial` (before event 0).
 *                                               V7 checks events with index > statedAt only
 *       "what": "Bob: Fridays only",            for the report
 *       "weekdays": ["fri"],                    allowed local weekdays (mon..sun) of a proposed, yes'd or booked slot
 *       "earliest": "11:30",                    local clock: the slot starts at or after it
 *       "latest": "13:30",                      local clock: the slot ends at or before it
 *       "durationMin": 60,                      the slot lasts exactly this long
 *       "mode": "in-person" | "virtual",        no propose note, ask text or book why names the other mode (MODE_WORDS),
 *                                               except in a negating phrase (NEGATED: "virtual instead of in-person").
 *                                               STILL A WORD LIST: it reads words, not meaning, so a mode named some other
 *                                               way, or negated some other way, is missed or misread
 *       "requiredAttendees": ["a@x.com"],       a book names every one (a colleague of the plan rides on it already)
 *       "maxProposals": 1,                      at most this many propose actions in the event's run
 *       "maxSlots": 2                           at most this many slots in any one proposal
 *   } ]
 *
 * Slots are checked on propose, record_yes and book (a yes to a time that breaks the constraint leads to a booking that
 * does); a slot id with no known time is V1's and skipped here. Lookups (check_calendar, read_link) are not actions on
 * the plan and are not checked. A refused action still counts.
 */
import type { Decision, SlotFact } from '../harness/src/capabilities/email/scheduler-agent/tools.js';

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export interface Constraint {
  id: string; statedAt?: number; what?: string;
  weekdays?: Weekday[]; earliest?: string; latest?: string; durationMin?: number;
  mode?: 'in-person' | 'virtual'; requiredAttendees?: string[]; maxProposals?: number; maxSlots?: number;
}
export interface ConstraintInForce extends Constraint { statedAt: number }

export const MODE_WORDS: Record<'in-person' | 'virtual', RegExp> = {
  // The words that name a mode; a constraint fires when an outbound text names the OTHER one.
  virtual: /\b(?:zoom|google meet|meet link|video(?: call)?|teams call|webex|dial[- ]in|phone call|virtual(?:ly)?|on a call)\b/i,
  'in-person': /\b(?:in[- ]person|face[- ]to[- ]face|at (?:the|our|his|your|their) (?:office|place)|over (?:lunch|coffee|dinner))\b/i,
};

/**
 * A mode word is not a claim of that mode when a negating phrase comes just before it, with up to three words between
 * ("instead of in-person", "rather than on a video call", "not a Zoom", "no longer in person", "switched from video").
 */
export const NEGATED = /\b(?:instead of|rather than|not|no longer|switch(?:ed|ing)? from)(?:\s+[\w'-]+){0,3}\s*$/i;

/** The first mode word of `mode` in the text that is not negated, or null. */
export function namesMode(text: string, mode: 'in-person' | 'virtual'): string | null {
  const re = new RegExp(MODE_WORDS[mode].source, 'gi');
  for (let m = re.exec(text); m; m = re.exec(text)) if (!NEGATED.test(text.slice(Math.max(0, m.index - 60), m.index))) return m[0];
  return null;
}

const DAYS: readonly Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const lower = (a: string): string => a.trim().toLowerCase();
const mins = (hhmm: string): number => { const [h, m] = hhmm.split(':').map(Number); return (h ?? 0) * 60 + (m ?? 0); };

/** Local weekday and minute-of-day of an instant in `tz`. */
export function localClock(iso: string, tz: string): { day: Weekday; min: number } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso));
  const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? '';
  return { day: DAYS[['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'))]!, min: Number(get('hour')) * 60 + Number(get('minute')) };
}

/** The constraints in force at event `index`: stated by an event at or before it, at an index before it. */
export function constraintsInForce(events: ReadonlyArray<{ index: number; expect: unknown }>, index: number): ConstraintInForce[] {
  const seen = new Map<string, ConstraintInForce>();
  for (const e of events) {
    if (e.index > index) continue;
    const raw = (e.expect as { constraints?: unknown }).constraints;
    if (raw === undefined) continue;
    if (!Array.isArray(raw)) throw new Error(`event ${e.index}: expect.constraints is not a list`);
    for (const c of raw as Constraint[]) {
      if (!c || typeof c.id !== 'string') throw new Error(`event ${e.index}: every expect.constraints entry needs an "id"`);
      seen.set(c.id, { ...c, statedAt: c.statedAt ?? e.index });
    }
  }
  return [...seen.values()].filter((c) => c.statedAt < index);
}

const slotIdsOf = (d: Decision): unknown[] => (d.tool === 'propose' ? (Array.isArray(d.args['slots']) ? d.args['slots'] : [d.args['slots']]) : d.tool === 'book' || d.tool === 'record_yes' ? [d.args['slot']] : []);
const textOf = (d: Decision): string => (d.tool === 'propose' ? String(d.args['note'] ?? '') : d.tool === 'ask' ? String(d.args['text'] ?? '') : d.tool === 'book' ? String(d.args['why'] ?? '') : '');

export interface V7Hit { step: number; constraint: string; why: string }

/** V7 over one event's actions; `known` resolves each action's slot ids in its own context. */
export function constraintHits(cs: readonly ConstraintInForce[], actions: ReadonlyArray<{ step: number; decision: Decision; known: (id: number) => SlotFact | undefined; colleagues: string[]; parties: string[] }>, tz: string): V7Hit[] {
  const hits: V7Hit[] = [];
  for (const c of cs) {
    const hit = (step: number, why: string): void => { hits.push({ step, constraint: c.id, why: `${c.id}${c.what ? ` (${c.what})` : ''}: ${why}` }); };
    let proposals = 0;
    for (const a of actions) {
      const d = a.decision;
      for (const n of slotIdsOf(d)) {
        const s = Number.isInteger(n) ? a.known(n as number) : undefined;
        if (!s) continue;
        const st = localClock(s.start, tz); const en = localClock(s.end, tz);
        if (c.weekdays?.length && !c.weekdays.includes(st.day)) hit(a.step, `${d.tool} slot ${s.id} (${s.start}) is a ${st.day}, not ${c.weekdays.join('/')}`);
        if (c.earliest && st.min < mins(c.earliest)) hit(a.step, `${d.tool} slot ${s.id} starts before ${c.earliest}`);
        if (c.latest && (en.day !== st.day ? 24 * 60 : en.min) > mins(c.latest)) hit(a.step, `${d.tool} slot ${s.id} ends after ${c.latest}`);
        const dur = Math.round((Date.parse(s.end) - Date.parse(s.start)) / 60_000);
        if (c.durationMin !== undefined && dur !== c.durationMin) hit(a.step, `${d.tool} slot ${s.id} lasts ${dur} min, not ${c.durationMin}`);
      }
      if (c.mode) {
        const other = c.mode === 'in-person' ? 'virtual' : 'in-person';
        const m = namesMode(textOf(d), other);
        if (m) hit(a.step, `${d.tool} text names ${other} ("${m}") on a ${c.mode} meeting`);
      }
      if (c.requiredAttendees?.length && d.tool === 'book') {
        const given = Array.isArray(d.args['attendees']) ? (d.args['attendees'] as unknown[]).filter((x): x is string => typeof x === 'string').map(lower) : a.parties;
        const on = new Set([...(given.length ? given : a.parties), ...a.colleagues]);
        const missing = c.requiredAttendees.map(lower).filter((r) => !on.has(r));
        if (missing.length) hit(a.step, `book leaves off ${missing.join(', ')}`);
      }
      if (d.tool === 'propose') {
        proposals += 1;
        if (c.maxProposals !== undefined && proposals > c.maxProposals) hit(a.step, `proposal ${proposals} in this event, more than ${c.maxProposals}`);
        const k = slotIdsOf(d).length;
        if (c.maxSlots !== undefined && k > c.maxSlots) hit(a.step, `a proposal of ${k} slots, more than ${c.maxSlots}`);
      }
    }
  }
  return hits;
}
