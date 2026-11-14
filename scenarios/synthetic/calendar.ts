/**
 * SYNTHETIC CALENDARS (design section 6b). Bob's week, written once by hand as a pattern, laid over each synthetic
 * scenario's dates in his zone (DST-aware: a 9:00 meeting is 9:00 on his wall clock on both sides of a transition), with
 * a per-scenario deterministic thinning so no two worlds are the same week, plus the scenario's own rows (a travel block,
 * a recurring series that starts in week two, a meeting over a named time). The output is the captured fixtures' shape
 * (scenarios/README.md "calendar.json") and their anonymized vocabulary, so the vendored family classifier reads the
 * family rows the way it reads the captured ones: "Family event N - dad" is his (busy), "- mom" is covered (context),
 * "Family practice N" is a kid's practice (context), a bare "Family event N" is nobody's (context).
 */
import type { CalendarFixture } from '../../conditions/world.js';
import type { CalEvent } from '../../harness/src/capabilities/calendar/google.js';

export type RowKind = 'meeting' | 'family-dad' | 'family-mom' | 'family-practice' | 'family-event' | 'personal' | 'block';

/** One row of Bob's week, in his wall clock. `title` overrides the generated one (a recurring series keeps its number). */
export interface Row {
  kind: RowKind;
  day: string;
  start?: string;
  end?: string;
  /** All-day rows: the exclusive end date. */
  endDay?: string;
  title?: string;
  location?: string;
  attendees?: string[];
  myResponse?: 'accepted' | 'needsAction' | 'tentative' | 'declined';
  transparent?: boolean;
  /** Never thinned (the scenario depends on it). */
  keep?: boolean;
}

/** The weekly pattern: weekday (0 Sunday) to rows without a day. Meeting numbers are the recurring series' titles. */
type PatternRow = Omit<Row, 'day'> & { n?: number; thin?: boolean };
const WEEK: Record<number, PatternRow[]> = {
  0: [{ kind: 'family-event', start: '10:00', end: '12:00', n: 6 }],
  1: [
    { kind: 'meeting', start: '09:00', end: '09:30', n: 1, location: 'https://video.example/1' },
    { kind: 'meeting', start: '11:00', end: '12:00', n: 2, thin: true, location: 'Bay 1' },
    { kind: 'meeting', start: '13:30', end: '14:30', n: 3, thin: true, location: 'https://video.example/3' },
    { kind: 'meeting', start: '15:30', end: '16:00', n: 4, thin: true },
    { kind: 'family-practice', start: '16:30', end: '18:30', n: 1 },
  ],
  2: [
    { kind: 'meeting', start: '09:00', end: '09:30', n: 1, location: 'https://video.example/1' },
    { kind: 'meeting', start: '10:00', end: '11:00', n: 5, thin: true, location: 'Bay 2' },
    { kind: 'meeting', start: '12:00', end: '13:00', n: 6, thin: true, location: 'Place 1' },
    { kind: 'meeting', start: '14:00', end: '15:00', n: 7, thin: true, location: 'https://video.example/7' },
    { kind: 'family-practice', start: '16:30', end: '18:30', n: 1 },
    { kind: 'family-dad', start: '17:30', end: '18:30', n: 2 },
  ],
  3: [
    { kind: 'family-dad', start: '07:30', end: '08:15', n: 4 },
    { kind: 'meeting', start: '09:00', end: '09:30', n: 1, location: 'https://video.example/1' },
    { kind: 'meeting', start: '10:30', end: '11:30', n: 8, thin: true, location: 'Bay 1' },
    { kind: 'meeting', start: '13:00', end: '14:00', n: 9, thin: true, location: 'https://video.example/9' },
    { kind: 'meeting', start: '15:00', end: '16:30', n: 10, thin: true, location: 'Bay 3' },
    { kind: 'family-practice', start: '16:30', end: '18:30', n: 1 },
    { kind: 'personal', start: '19:00', end: '21:00', n: 1, location: 'Place 2' },
  ],
  4: [
    { kind: 'meeting', start: '09:00', end: '09:30', n: 1, location: 'https://video.example/1' },
    { kind: 'meeting', start: '11:00', end: '12:00', n: 11, thin: true, location: 'https://video.example/11' },
    { kind: 'meeting', start: '13:30', end: '14:00', n: 12, thin: true },
    { kind: 'family-mom', start: '15:00', end: '16:00', n: 3 },
    { kind: 'meeting', start: '15:30', end: '16:30', n: 13, thin: true, location: 'Bay 2' },
    { kind: 'family-practice', start: '16:30', end: '18:30', n: 1 },
  ],
  5: [
    { kind: 'meeting', start: '09:00', end: '09:30', n: 1, location: 'https://video.example/1' },
    { kind: 'meeting', start: '10:00', end: '10:45', n: 14, thin: true, location: 'https://video.example/14' },
    { kind: 'meeting', start: '12:00', end: '13:00', n: 15, thin: true, location: 'Place 3', myResponse: 'needsAction' },
    { kind: 'family-dad', start: '14:30', end: '15:30', n: 7 },
  ],
  6: [{ kind: 'family-dad', start: '09:00', end: '11:00', n: 5, location: 'Place 4' }],
};

/** An instant for Bob's wall clock on a day, in the zone (both sides of a DST transition). */
export function localToUtc(day: string, hhmm: string, tz: string): string {
  const base = Date.parse(`${day}T${hhmm}:00.000Z`);
  let guess = base;
  for (let i = 0; i < 3; i += 1) guess = base - offsetMs(tz, guess);
  return new Date(guess).toISOString();
}
function offsetMs(tz: string, utcMs: number): number {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]));
  return Date.UTC(Number(p['year']), Number(p['month']) - 1, Number(p['day']), Number(p['hour']), Number(p['minute']), Number(p['second'])) - utcMs;
}
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const weekday = (day: string): number => new Date(`${day}T12:00:00Z`).getUTCDay();

/** A small deterministic hash (FNV-1a), for the thinning. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h;
}

export interface CalendarSpec {
  /** The scenario id: seeds the thinning. */
  id: string;
  tz: string;
  /** The scenario's now: the sync stamps are fifteen minutes before it. */
  now: string;
  /** First and last day the rows cover (inclusive). */
  from: string;
  to: string;
  /** The coverage horizon (days after now) the sync rows claim; the check calls a time past it unknown. */
  horizonDays: number;
  /** The plan's window, for `about` and `window`. */
  window: { from: string; days: number };
  /** Rows the scenario needs, added after the pattern. */
  extra?: Row[];
  /** Pattern rows to remove: day plus start, local ("2026-11-10T10:00"). */
  drop?: string[];
  /** Days with no pattern rows at all (a holiday, a day away). */
  emptyDays?: string[];
  /** Share of thinnable meetings to drop (default 0.2). */
  thin?: number;
  about: string;
}

const people = (n: number, k: number): string[] => Array.from({ length: k }, (_, i) => `person${((n * 7 + i * 3) % 90) + 1}@example.com`);

export function buildCalendar(spec: CalendarSpec): CalendarFixture {
  const rows: Row[] = [];
  const drop = new Set(spec.drop ?? []);
  for (let day = spec.from; day <= spec.to; day = addDays(day, 1)) {
    if (spec.emptyDays?.includes(day)) continue;
    for (const r of WEEK[weekday(day)] ?? []) {
      if (drop.has(`${day}T${r.start}`)) continue;
      if (r.thin && (hash(`${spec.id}|${day}|${r.start}`) % 100) < (spec.thin ?? 0.2) * 100) continue;
      const { n, thin: _t, ...rest } = r; void _t;
      rows.push({ ...rest, day, title: titleFor(r.kind, n ?? 0) });
    }
  }
  rows.push(...(spec.extra ?? []));
  rows.sort((a, b) => `${a.day}T${a.start ?? '00:00'}`.localeCompare(`${b.day}T${b.start ?? '00:00'}`));
  const events: CalEvent[] = rows.map((r, i) => toEvent(r, i + 1, spec.tz));
  const synced = new Date(Date.parse(spec.now) - 15 * 60_000);
  const sync = (source: string, count: number) => ({
    source, lastSyncedAt: synced.toISOString(), windowStart: new Date(synced.getTime() - 3 * 86_400_000).toISOString(),
    windowEnd: new Date(synced.getTime() + spec.horizonDays * 86_400_000).toISOString(), eventCount: count, lastError: null,
  });
  const count = (s: string): number => events.filter((e) => e.source === s).length;
  return { about: spec.about, tz: spec.tz, window: spec.window, syncStatus: [sync('work', count('work')), sync('personal', count('personal')), sync('family', count('family'))], events };
}

function titleFor(kind: RowKind, n: number): string {
  switch (kind) {
    case 'meeting': return `Meeting ${n}`;
    case 'family-dad': return `Family event ${n} - dad`;
    case 'family-mom': return `Family event ${n} - mom`;
    case 'family-practice': return `Family practice ${n}`;
    case 'family-event': return `Family event ${n}`;
    case 'personal': return `Personal ${n}`;
    case 'block': return `Block ${n}`;
  }
}

function toEvent(r: Row, i: number, tz: string): CalEvent {
  const source = r.kind === 'meeting' || r.kind === 'block' ? 'work' : r.kind === 'personal' ? 'personal' : 'family';
  const calendarId = `${source}-calendar`;
  const title = r.title ?? titleFor(r.kind, i);
  const allDay = r.start === undefined;
  const startAt = allDay ? r.day : localToUtc(r.day, r.start!, tz);
  const endAt = allDay ? (r.endDay ?? addDays(r.day, 1)) : localToUtc(r.day, r.end!, tz);
  const n = Number(/\d+/.exec(title)?.[0] ?? i);
  const base = { id: `evt-${i}`, source, calendarId, title, startAt, endAt, allDay, ...(r.location ? { location: r.location } : {}) };
  if (source === 'family') return { ...base, attendees: [], status: 'confirmed', ...(r.transparent ? { transparent: true } : {}) } as unknown as CalEvent;
  const me = source === 'personal' ? 'bob.personal@example.net' : 'bob@example.com';
  const response = r.myResponse ?? 'accepted';
  const others = r.attendees ?? (source === 'personal' ? [`guest${(n % 40) + 1}@external.example`] : people(n, r.kind === 'block' ? 2 : 2 + (n % 4)));
  return {
    ...base, organizer: others[0] ?? me,
    attendees: [...others.map((email, k) => ({ email, response: k === 0 ? 'accepted' : 'needsAction' })), { email: me, response }],
    myResponse: response, status: 'confirmed', ...(r.transparent ? { transparent: true } : {}),
  } as unknown as CalEvent;
}
