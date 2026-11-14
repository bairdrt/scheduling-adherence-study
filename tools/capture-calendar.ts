/**
 * CAPTURE A SCENARIO'S CALENDAR ONCE, ANONYMIZED (docs/study-design.md section 6; harness/VENDORED.md, "The calendar
 * fixture").
 *
 *   npx tsx tools/capture-calendar.ts --scenario=<id> --scratch=<dir> --source=snapshot:<var-backup commit> | --source=live
 *
 * SOURCE. Winnie's events.db is copied into --scratch and ONLY the copy is opened. Two sources:
 *   - snapshot:<commit>: the nightly SQL dump in winnie/var-backup at that commit, read with `git show` and restored
 *     into a new database in --scratch. Use the snapshot nearest the scenario's now (`git -C winnie/var-backup log`):
 *     the live store keeps re-syncing a window three days back and fourteen ahead, so today's copy shows October as
 *     it stood weeks later. Plan 39 used 70b7fc8 (2026-10-11 06:15Z).
 *   - live: winnie/var/db/events.db (with its -wal and -shm) copied as it is now.
 *
 * WHICH ROWS. What Winnie's store held at the scenario's `now`: a sync at now minus 15 minutes reaching three days back
 * and fourteen ahead (her sync's window), together with the ask's own window, and nothing starting past that horizon
 * (rows the live store at `now` had not synced yet). The sync status is synthesized the same way.
 *
 * WHAT IS WRITTEN. scenarios/<id>/calendar.json: those rows with titles, attendees, organizers, locations and ids
 * replaced. var/anonymization.json gets the mapping under "<id>/calendar" (private, never committed). The mapping is
 * EXTENDED across scenarios, not restarted: a person, place or title already mapped for an earlier scenario keeps its
 * pseudonym, and new ones continue the numbering.
 *
 * WHAT IS PROVED. The anonymized world answers exactly as the original does, through the vendored harness: per event,
 * occupiesBobsTime, isContextEvent (Winnie's own family rules on the original, the vendored defaults on the copy), the
 * site kind and travel padding; per world, check_calendar over the ask's window and over the whole synced span, a
 * named-time check of every slot she offered on the plan and every time an event's facts name, the windows an event's
 * facts name, and read_link when a Calendly capture exists: the same ids, free verdicts and number of reasons. Any
 * difference exits 1 and nothing is written.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import Database from 'better-sqlite3';
import { CalendarStore } from '../harness/src/capabilities/calendar/store.js';
import type { CalEvent } from '../harness/src/capabilities/calendar/google.js';
import { occupiesBobsTime } from '../harness/src/capabilities/calendar/occupancy.js';
import { DEFAULT_FAMILY_RULES, familyAssignment, isContextEvent, parseFamilyRules, type FamilyClassRules } from '../harness/src/capabilities/calendar/family-class.js';
import { classifyFamilyEvent } from '../harness/src/capabilities/calendar/family-class.js';
import { DEFAULT_TRANSITION, occupyPadding, siteOf } from '../harness/src/capabilities/calendar/transition.js';
import { addLocalDays, makeLocalEpochConverter } from '../harness/src/capabilities/calendar/availability.js';
import { localDateTime } from '../harness/src/shared/time.js';
import { normalize, validateScenario, type Scenario } from '../scenarios/load.js';
import { buildWorld, REPO_ROOT, type CalendarFixture, type SyncRow } from '../conditions/world.js';

const WINNIE = '/Users/claudbot/Projects/personal/winnie';
const PINNED = 'ca6b6ee';
const args = process.argv.slice(2);
const arg = (k: string): string | undefined => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const scenarioId = arg('scenario') ?? 'plan-39';
const scratch = arg('scratch');
const source = arg('source') ?? 'snapshot:70b7fc8';
if (!scratch) { console.error('--scratch=<dir> is required: the copy of events.db goes there and nowhere else'); process.exit(2); }

/** The copy, never the original. */
function copyOfEvents(): string {
  fs.mkdirSync(scratch!, { recursive: true });
  if (source === 'live') {
    const dst = path.join(scratch!, 'events-live.db');
    for (const ext of ['', '-wal', '-shm']) {
      const f = path.join(WINNIE, 'var', 'db', `events.db${ext}`);
      if (fs.existsSync(f)) fs.copyFileSync(f, `${dst}${ext}`);
    }
    return dst;
  }
  const commit = source.replace(/^snapshot:/, '');
  if (!/^[0-9a-f]{7,40}$/.test(commit)) throw new Error(`--source must be live or snapshot:<commit>, not ${source}`);
  const dst = path.join(scratch!, `events-${commit}.db`);
  fs.rmSync(dst, { force: true });
  const dump = execFileSync('git', ['-C', path.join(WINNIE, 'var-backup'), 'show', `${commit}:db/events.db.sql`], { maxBuffer: 1 << 30 });
  execFileSync('sqlite3', [dst], { input: dump, maxBuffer: 1 << 30 });
  return dst;
}

const scDir = path.join(REPO_ROOT, 'scenarios', scenarioId);
const scFile = normalize(validateScenario(JSON.parse(fs.readFileSync(path.join(scDir, 'scenario.json'), 'utf8'))));
const tz = scFile.tz;
const shape = scFile.plan.askShape as { from: string; days: number };
const toEpoch = makeLocalEpochConverter(tz);
const now = new Date(scFile.now);
const syncedAt = new Date(now.getTime() - 15 * 60_000);
const horizon = new Date(syncedAt.getTime() + 14 * 86_400_000);
const syncStart = new Date(syncedAt.getTime() - 3 * 86_400_000);
const askStart = toEpoch(shape.from, 0);
const askEnd = toEpoch(addLocalDays(shape.from, shape.days), 0);
const winStart = new Date(Math.min(askStart, syncStart.getTime())).toISOString();
const winEnd = new Date(Math.max(askEnd, horizon.getTime())).toISOString();

// Winnie's own config at the pinned commit: the family rules and the operator addresses the original world uses.
const winnieCfg = JSON.parse(execFileSync('git', ['-C', path.join(WINNIE, 'winnie'), 'show', `${PINNED}:config/winnie.json`], { encoding: 'utf8' })) as { family: Record<string, unknown>; email: { operatorAddresses: string[] } };
const realRules: FamilyClassRules = parseFamilyRules(winnieCfg.family);
const realOps = winnieCfg.email.operatorAddresses.map((a) => a.toLowerCase());
const anonOps = scFile.world.operatorAddresses;

const dbPath = copyOfEvents();
const db = new Database(dbPath);
const store = new CalendarStore(db);
const startOf = (e: CalEvent): number => (e.allDay ? toEpoch(e.startAt.slice(0, 10), 0) : Date.parse(e.startAt));
const original = store.eventsInRange(winStart, winEnd).filter((e) => startOf(e) < horizon.getTime());
// Rows the snapshot shows as updated after `now`: they may have changed (or appeared) after the scenario's instant.
const touchedAfter = original.filter((e) => e.updatedAt && Date.parse(e.updatedAt) > now.getTime()).length;
db.close();

/* ---------------------------------------------------------------- anonymization, extending the mapping */

type MapPart = { titles: Record<string, string>; people: Record<string, string>; locations: Record<string, string>; ids: Record<string, string>; calendars: Record<string, string> };
const priv = path.join(REPO_ROOT, 'var', 'anonymization.json');
const prev = fs.existsSync(priv) ? JSON.parse(fs.readFileSync(priv, 'utf8')) as Record<string, Partial<MapPart> & Record<string, unknown>> : {};
const map: MapPart = { titles: {}, people: {}, locations: {}, ids: {}, calendars: {} };
const counters = { meeting: 0, allDay: 0, family: 0, personal: 0, person: 0, place: 0, ext: 0, virtual: 0, evt: 0 };
const maxN = (vals: Iterable<string>, re: RegExp): number => Math.max(0, ...[...vals].map((v) => Number(re.exec(v)?.[1] ?? 0)));
// Every earlier scenario's calendar mapping seeds this one, so pseudonyms are stable across scenarios.
for (const [k, v] of Object.entries(prev)) {
  if (!k.endsWith('/calendar') || k === `${scenarioId}/calendar`) continue;
  Object.assign(map.titles, v.titles ?? {}); Object.assign(map.people, v.people ?? {}); Object.assign(map.locations, v.locations ?? {});
}
const titleVals = Object.values(map.titles);
counters.meeting = maxN(titleVals, /^Meeting (\d+)$/);
counters.allDay = maxN(titleVals, /^Block (\d+)$/);
counters.personal = maxN(titleVals, /^Personal (\d+)$/);
counters.family = maxN(titleVals, /^Family (?:event|practice) (\d+)/);
counters.person = maxN(Object.values(map.people), /^person(\d+)@/);
counters.ext = maxN(Object.values(map.people), /^guest(\d+)@/);
counters.place = maxN(Object.values(map.locations), /^(?:Place|Bay) (\d+)$/);
counters.virtual = maxN(Object.values(map.locations), /video\.example\/(\d+)$/);
const norm = (t: string): string => t.replace(/\s+/g, ' ').trim();
const homeDomain = (realOps[0] ?? '').split('@')[1] ?? '';

function person(email: string): string {
  const e = email.trim().toLowerCase();
  const op = realOps.indexOf(e);
  if (op >= 0) return anonOps[op] ?? anonOps[0]!;
  if (!map.people[e]) map.people[e] = e.endsWith(`@${homeDomain}`) ? `person${++counters.person}@example.com` : `guest${++counters.ext}@external.example`;
  return map.people[e]!;
}

/** A location with the same siteOf kind, the same home-site verdict and the same identity between rows. */
function place(loc: string | undefined): string | undefined {
  if (loc === undefined || loc.trim() === '') return loc;
  const s = siteOf(loc, DEFAULT_TRANSITION);
  if (map.locations[s.key]) return map.locations[s.key];
  let out: string;
  if (s.kind === 'virtual') out = `https://video.example/${++counters.virtual}`;
  else if (s.kind === 'unknown') out = 'TBD';
  else if (s.kind === 'office') out = s.key === DEFAULT_TRANSITION.homeSite ? `Bay ${++counters.place}` : s.key === 'office:nyc' ? 'New York Office' : 'Chicago Tower';
  else out = `Place ${++counters.place}`;
  map.locations[s.key] = out;
  return out;
}

/** A family title that the vendored DEFAULT_FAMILY_RULES classify exactly as Winnie's own rules classify the original. */
function familyTitle(e: CalEvent): string {
  const key = `family:${norm(e.title)}`;
  if (map.titles[key]) return map.titles[key]!;
  const n = ++counters.family;
  const a = familyAssignment({ title: e.title, startAt: e.startAt, endAt: e.endAt, allDay: e.allDay }, { rules: realRules });
  const verdict = classifyFamilyEvent(e.title, realRules);
  const t = a.who === 'bob' ? `Family event ${n} - dad` : a.who === 'other' ? `Family event ${n} - mom` : verdict.cls === 'informational' ? `Family practice ${n}` : `Family event ${n}`;
  map.titles[key] = t;
  return t;
}

function title(e: CalEvent): string {
  if (e.source === 'family') return familyTitle(e);
  const key = `${e.source}:${e.allDay ? 'allday' : 'timed'}:${norm(e.title)}`;
  if (!map.titles[key]) map.titles[key] = e.source === 'personal' ? `Personal ${++counters.personal}` : e.allDay ? `Block ${++counters.allDay}` : `Meeting ${++counters.meeting}`;
  return map.titles[key]!;
}

const anonymized: CalEvent[] = original.map((e) => {
  const id = `evt-${++counters.evt}`; map.ids[e.id] = id;
  if (!map.calendars[e.calendarId]) map.calendars[e.calendarId] = `${e.source}-calendar`;
  const loc = place(e.location);
  return {
    id, source: e.source, calendarId: map.calendars[e.calendarId]!, title: title(e), startAt: e.startAt, endAt: e.endAt, allDay: e.allDay,
    ...(loc !== undefined ? { location: loc } : {}),
    ...(e.organizer ? { organizer: person(e.organizer) } : {}),
    // Names dropped, addresses pseudonymous; the response and the optional flag kept.
    attendees: (e.attendees ?? []).map((x) => ({ email: person(x.email), ...(x.response ? { response: x.response } : {}), ...(x.optional ? { optional: true as const } : {}) })),
    ...(e.myResponse ? { myResponse: e.myResponse } : {}),
    status: e.status,
    ...(e.transparent ? { transparent: true } : {}),
  };
});

const sources = [...new Set(['work', 'personal', 'family', ...original.map((e) => e.source)])];
const syncStatus: SyncRow[] = sources.map((s) => ({
  source: s, lastSyncedAt: syncedAt.toISOString(), windowStart: syncStart.toISOString(), windowEnd: horizon.toISOString(),
  eventCount: original.filter((e) => e.source === s).length, lastError: null,
}));

/* ---------------------------------------------------------------- proof: per event */

const problems: string[] = [];
original.forEach((o, i) => {
  const a = anonymized[i]!;
  const realView = { rules: realRules }; const anonView = { rules: DEFAULT_FAMILY_RULES };
  const pairs: Array<[string, unknown, unknown]> = [
    ['occupiesBobsTime', occupiesBobsTime(o), occupiesBobsTime(a)],
    ['isContextEvent', isContextEvent(o, realView), isContextEvent(a, anonView)],
    ['familyWho', o.source === 'family' ? familyAssignment({ title: o.title, startAt: o.startAt, endAt: o.endAt, allDay: o.allDay }, realView).who : null,
      a.source === 'family' ? familyAssignment({ title: a.title, startAt: a.startAt, endAt: a.endAt, allDay: a.allDay }, anonView).who : null],
    ['siteKind', siteOf(o.location).kind, siteOf(a.location).kind],
    ['padding', JSON.stringify([occupyPadding(o.location).beforeMin, occupyPadding(o.location).afterMin]), JSON.stringify([occupyPadding(a.location).beforeMin, occupyPadding(a.location).afterMin])],
    ['operatorAttendee', o.attendees.some((x) => realOps.includes(x.email.toLowerCase())), a.attendees.some((x) => anonOps.includes(x.email.toLowerCase()))],
  ];
  for (const [what, x, y] of pairs) if (x !== y) problems.push(`event ${a.id} (${o.startAt}): ${what} ${String(x)} -> ${String(y)}`);
});

/* ---------------------------------------------------------------- proof: through the tools */

const syncDays = Math.ceil((horizon.getTime() - now.getTime()) / 86_400_000);
const anonFixture: CalendarFixture = {
  about: `Bob's calendar as Winnie's store held it at ${scFile.now} (scenario ${scenarioId}), from Winnie's events.db (${source}), anonymized by tools/capture-calendar.ts: titles, attendees, organizers, locations and ids replaced; times, responses, transparency, all-day flags and the family and location classes kept. Rows cover the synced span (sync at now minus 15 minutes, three days back, fourteen ahead) and the ask's window; rows starting past the sync horizon are dropped. ${touchedAfter} row(s) show an update after now in the snapshot. The plan's own holds are not in the rows: the snapshot postdates their release.`,
  tz, window: { from: shape.from, days: shape.days }, syncStatus, events: anonymized,
};
const origFixture: CalendarFixture = { ...anonFixture, events: original };
const cal = scFile.world.calendly;
const calendly = cal ? { eventTypes: JSON.parse(fs.readFileSync(path.join(scDir, cal.eventTypes), 'utf8')) as unknown, range: JSON.parse(fs.readFileSync(path.join(scDir, cal.range), 'utf8')) as unknown } : undefined;
const sc = (fx: CalendarFixture): Scenario => ({ ...scFile, fileSchema: 2, dir: scDir, calendar: fx, ...(calendly ? { calendly } : {}) });

/** Every slot she offered on the plan (initial and the captures), and every time and window an event's facts name. */
const offeredStarts = [...(scFile.initial.offered ?? []), ...scFile.events.flatMap((e) => e.capture?.offered ?? [])].map((o) => o.start);
const factTimes = scFile.events.flatMap((e) => (e.facts ?? []).flatMap((f) => (Array.isArray(f.args['times']) ? (f.args['times'] as string[]) : [])));
const factWindows = scFile.events.flatMap((e) => (e.facts ?? []).flatMap((f) => (Array.isArray(f.args['windows']) ? (f.args['windows'] as Array<{ from: string; days: number; earliest?: string; latest?: string }>) : [])));
const durationMin = (scFile.plan.askShape as { durationMin?: number }).durationMin ?? 30;

async function answers(fx: CalendarFixture, rules: 'default' | Record<string, unknown>, ops: string[]): Promise<Record<string, Array<{ id: number; start: string; free: boolean; reasons: number }>>> {
  const w = buildWorld(sc(fx), { familyRules: rules, operatorAddresses: ops });
  const out: Record<string, Array<{ id: number; start: string; free: boolean; reasons: number }>> = {};
  const view = (r: { slots: Array<{ id: number; start: string; free: boolean; inTheWay: string[] }> }) => r.slots.map((s) => ({ id: s.id, start: s.start, free: s.free, reasons: s.inTheWay.length }));
  if (cal) {
    const link = await w.lookups.readLink({ party: cal.party, url: cal.url, durationMin, inPerson: true, window: { from: shape.from, days: shape.days } });
    out['read_link'] = view(link);
    out['check named (all link times)'] = view(await w.lookups.checkCalendar({ times: link.slots.map((s) => isoLocal(s.start)), durationMin }));
  }
  if (scenarioId === 'plan-39') out['check named (Wed Oct 21 afternoon)'] = view(await w.lookups.checkCalendar({ times: ['2026-10-21T12:00', '2026-10-21T12:30', '2026-10-21T13:00', '2026-10-21T15:30', '2026-10-21T16:00'], durationMin }));
  out['check window (the ask)'] = view(await w.lookups.checkCalendar({ window: { from: shape.from, days: shape.days }, durationMin }));
  out['check window (the synced span)'] = view(await w.lookups.checkCalendar({ window: { from: isoLocal(now.toISOString()).slice(0, 10), days: syncDays }, durationMin }));
  const named = [...new Set([...offeredStarts.map(isoLocal), ...factTimes])];
  if (named.length) out['check named (offered and fact times)'] = view(await w.lookups.checkCalendar({ times: named, durationMin }));
  if (factWindows.length) out['check windows (fact windows)'] = view(await w.lookups.checkCalendar({ windows: factWindows, durationMin }));
  w.close();
  return out;
}
/** An instant as Bob's wall clock, "YYYY-MM-DDTHH:MM", the form check_calendar's "times" takes. */
function isoLocal(iso: string): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p['year']}-${p['month']}-${p['day']}T${p['hour']}:${p['minute']}`;
}

async function main(): Promise<void> {
  const before = await answers(origFixture, winnieCfg.family, realOps);
  const after = await answers(anonFixture, 'default', anonOps);
  for (const k of Object.keys(before)) {
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) problems.push(`${k}: original ${JSON.stringify(before[k])} != anonymized ${JSON.stringify(after[k])}`);
  }
  console.log(`source ${source}; ${original.length} rows from ${winStart} to the coverage end ${horizon.toISOString()}; ${touchedAfter} updated after now`);
  console.log('SANITY: what the anonymized world answers');
  for (const k of Object.keys(after)) {
    if (k.startsWith('check window')) { console.log(`  ${k}: ${after[k]!.length} free slot(s), first ${after[k]![0] ? localDateTime(after[k]![0]!.start, tz) : '-'}`); continue; }
    for (const s of after[k]!) console.log(`  ${k}: slot ${s.id} ${localDateTime(s.start, tz)} ${s.free ? 'FREE' : `not free (${s.reasons} reason(s))`}`);
  }
  if (problems.length) {
    console.error(`ANONYMIZATION CHANGED THE ANSWERS (${problems.length}):\n${problems.slice(0, 40).join('\n')}`);
    process.exit(1);
  }
  fs.writeFileSync(path.join(scDir, 'calendar.json'), `${JSON.stringify(anonFixture, null, 1)}\n`);
  fs.mkdirSync(path.join(REPO_ROOT, 'var'), { recursive: true });
  const latest = fs.existsSync(priv) ? JSON.parse(fs.readFileSync(priv, 'utf8')) as Record<string, unknown> : {};
  fs.writeFileSync(priv, `${JSON.stringify({ ...latest, [`${scenarioId}/calendar`]: { source, capturedAt: new Date().toISOString(), ...map } }, null, 1)}\n`);
  console.log(`OK: ${anonymized.length} rows; every per-event predicate and every tool answer matches. Wrote scenarios/${scenarioId}/calendar.json and var/anonymization.json`);
}

main().catch((e: unknown) => { console.error(e); process.exit(1); });
