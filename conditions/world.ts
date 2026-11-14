/**
 * THE FROZEN WORLD OF ONE SCENARIO, as the vendored harness reads it: Bob's calendar from the fixture (loaded into an
 * in-memory SQLite through the vendored CalendarStore, so every query is the production one), a fresh in-memory offers
 * record, the scheduling policy, the family rules, and check_calendar / read_link exactly as Winnie's eval runner wires
 * them (tools/evals/scheduling-agent.ts at ca6b6ee: availabilityDeps, the check deps, makeLookupDeps; Calendly served
 * from the captures).
 *
 * Differences from the eval runner, all deliberate (harness/VENDORED.md, "Bench wiring"):
 *   - no stakes weigher (it reads Bob's private stakes.md; it only ranks conflicts, never changes `free`);
 *   - the availability deps get the scenario's `now`, so the staleness caveat is computed against the frozen clock;
 *   - no Router, spend meter or identity payload: the model is the bench's adapter (models/).
 *
 * Nothing here reads a live store, a network or a clock.
 */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { CAL_DDL, CalendarStore } from '../harness/src/capabilities/calendar/store.js';
import type { CalEvent } from '../harness/src/capabilities/calendar/google.js';
import { OffersStore, OFFERS_DDL } from '../harness/src/capabilities/calendar/offers.js';
import { availabilityDeps, type AvailabilityDeps, type AvailabilityWiring } from '../harness/src/capabilities/calendar/availability.js';
import type { ColleagueEvent, ColleagueRead } from '../harness/src/capabilities/calendar/colleagues.js';
import { describeSyncStatus } from '../harness/src/capabilities/calendar/view.js';
import { parseSchedulingPolicy } from '../harness/src/capabilities/calendar/policy.js';
import { DEFAULT_FAMILY_RULES, parseFamilyRules, type FamilyClassRules } from '../harness/src/capabilities/calendar/family-class.js';
import { openDb } from '../harness/src/shared/db.js';
import { localDateTime, setDisplayTimeZone } from '../harness/src/shared/time.js';
import { makeLookupDeps, ruleReadersOf } from '../harness/src/capabilities/email/scheduler-agent/wire.js';
import { allSacrificed, shapeAfterAmend, type AmendField, type Span } from '../harness/src/capabilities/email/scheduler-agent/amend.js';
import { declaredSacrifices, type PlanAmendment } from '../harness/src/capabilities/calendar/plans.js';
import type { RuleReaders } from '../harness/src/capabilities/email/scheduling-rules.js';
import type { AskShape } from '../harness/src/capabilities/email/ask-shape.js';
import type { ToolDeps } from '../harness/src/capabilities/email/scheduler-agent/tools.js';
import type { Scenario } from '../scenarios/load.js';

export interface SyncRow { source: string; lastSyncedAt: string; windowStart: string; windowEnd: string; eventCount: number; lastError: string | null }

/** scenarios/<id>/calendar.json: the anonymized rows and the store's sync status as of the scenario's now. */
export interface CalendarFixture {
  about: string;
  tz: string;
  window: { from: string; days: number };
  syncStatus: SyncRow[];
  events: CalEvent[];
}

export interface WorldOptions {
  /** Family rules: the vendored DEFAULT_FAMILY_RULES ("default"), or a raw config object for parseFamilyRules. */
  familyRules: 'default' | Record<string, unknown>;
}

export interface World {
  tz: string;
  now: Date;
  fmt: (iso: string) => string;
  offers: OffersStore;
  /** Every row the offer record holds, by id (the runner carries them to the next event's world). */
  minted: () => Array<{ id: number; start: string; end: string }>;
  lookups: Pick<ToolDeps, 'checkCalendar' | 'readLink'>;
  availability: AvailabilityDeps;
  /**
   * THE PLAN AS AMENDED IN THIS RUN, the store's half of production's amend dep (wire.ts makeAgentToolDeps): the shape after
   * shapeAfterAmend and the amendments with this one appended, stamped with the world's now. The lookups read both through
   * the same thunks production hands makeLookupDeps, so an amend narrows the next search. conditions/common.ts's recorder
   * calls it and returns what production's dep returns on success.
   */
  amendPlan: (a: { field: AmendField; value: unknown; hard: boolean; words: string }) => { shape: AskShape; amendments: readonly PlanAmendment[] };
  close: () => void;
}

/** An in-memory calendar store holding exactly the fixture's rows and sync status. */
export function storeFrom(fx: Pick<CalendarFixture, 'events' | 'syncStatus'>): { store: CalendarStore; db: Database.Database } {
  const db = new Database(':memory:');
  db.exec(CAL_DDL);
  const store = new CalendarStore(db);
  const ins = db.prepare(`INSERT INTO calendar_events (id, source, calendar_id, title, start_at, end_at, all_day, location, description, organizer, attendees, my_response, status, updated_at, created_at, synced_at, transparent, video_link)
    VALUES (@id, @source, @calendarId, @title, @startAt, @endAt, @allDay, @location, NULL, @organizer, @attendees, @myResponse, @status, @updatedAt, NULL, @syncedAt, @transparent, NULL)`);
  for (const e of fx.events) {
    ins.run({
      id: e.id, source: e.source, calendarId: e.calendarId, title: e.title, startAt: e.startAt, endAt: e.endAt, allDay: e.allDay ? 1 : 0,
      location: e.location ?? null, organizer: e.organizer ?? null, attendees: JSON.stringify(e.attendees ?? []), myResponse: e.myResponse ?? null,
      status: e.status, updatedAt: e.updatedAt ?? null, syncedAt: fx.syncStatus[0]?.lastSyncedAt ?? '', transparent: e.transparent ? 1 : 0,
    });
  }
  const sync = db.prepare(`INSERT INTO calendar_sync (source, last_synced_at, window_start, window_end, event_count, last_error) VALUES (?, ?, ?, ?, ?, ?)`);
  for (const s of fx.syncStatus) sync.run(s.source, s.lastSyncedAt, s.windowStart, s.windowEnd, s.eventCount, s.lastError);
  return { store, db };
}

export function familyRulesOf(o: WorldOptions['familyRules']): FamilyClassRules {
  return o === 'default' ? DEFAULT_FAMILY_RULES : parseFamilyRules(o);
}

/**
 * Build the world for a scenario. `calendar` defaults to the scenario's fixture; the capture tool passes the original
 * (un-anonymized) rows and Winnie's own family rules to prove the anonymized world answers the same.
 */
export interface WorldOverrides {
  calendar?: CalendarFixture;
  familyRules?: WorldOptions['familyRules'];
  operatorAddresses?: string[];
  calendly?: { eventTypes: unknown; range: unknown };
  /** The event's instant (multi-event scenarios); the scenario's `now` when absent. */
  now?: string;
  /** Amendments carried from earlier events' runs (PlanCarry.amendments): the plan the lookups start from (planAsAmended). */
  amendments?: readonly PlanAmendment[];
  /**
   * Offer rows to hold BEFORE the run, with their own ids (her proposals already sent, and every id an earlier event
   * minted): byN answers for them, and the next id minted is one past the highest, as in Winnie's store.
   */
  offers?: ReadonlyArray<{ id: number; start: string; end: string }>;
}

/** Colleagues' free/busy from the scenario's fixture (world.colleagueCalendars); an address not in it is unreadable. */
function colleagueReads(cals: NonNullable<Scenario['world']['colleagueCalendars']>): { freeBusy: NonNullable<AvailabilityWiring['freeBusy']>; readOthers: (emails: readonly string[], w: { timeMin: string; timeMax: string }) => Promise<ColleagueRead> } {
  const spans = new Map(Object.entries(cals).map(([who, xs]) => [who.toLowerCase(), xs.map((x) => ({ start: Date.parse(x.start), end: Date.parse(x.end) }))]));
  const inWin = (who: string, w: { timeMin: string; timeMax: string }): Array<{ start: number; end: number }> => (spans.get(who) ?? []).filter((s) => s.end > Date.parse(w.timeMin) && s.start < Date.parse(w.timeMax));
  const unreadable = (emails: readonly string[]): Array<{ email: string; reason: string }> => emails.filter((e) => !spans.has(e.toLowerCase())).map((email) => ({ email, reason: 'not in the scenario fixture' }));
  return {
    freeBusy: async (emails, w) => ({ busy: new Map(emails.filter((e) => spans.has(e.toLowerCase())).map((e) => [e.toLowerCase(), inWin(e.toLowerCase(), w)])), unreadable: unreadable(emails) }),
    readOthers: async (emails, w) => ({
      events: new Map(emails.filter((e) => spans.has(e.toLowerCase())).map((e): [string, ColleagueEvent[]] => [e.toLowerCase(), inWin(e.toLowerCase(), w).map((s) => ({ who: e.toLowerCase(), title: 'Busy', start: s.start, end: s.end, allDay: false, transparent: false, private: false, others: 0, own: true }))])),
      unreadable: unreadable(emails),
    }),
  };
}

/**
 * THE PLAN ROW AS AMENDED BEFORE THIS EVENT: the scenario plan's own amendments with the carried ones after them, and the
 * ask shape with each carried amendment applied in order (shapeAfterAmend, the function production's amend dep writes
 * ask_shape from, wire.ts makeAgentToolDeps). The scenario's own askShape already stands for its own amendments.
 */
export function planAsAmended(sc: Scenario, carried: readonly PlanAmendment[] = []): { askShape: AskShape; amendments: PlanAmendment[] } {
  const own = (sc.plan as unknown as { amendments?: PlanAmendment[] }).amendments ?? [];
  let askShape = sc.plan.askShape as unknown as AskShape;
  for (const a of carried) askShape = shapeAfterAmend(askShape, a.field as AmendField, a.value, a.hard);
  return { askShape, amendments: [...own, ...carried] };
}

export function buildWorld(sc: Scenario, over: WorldOverrides = {}): World {
  const cal = over.calendar ?? sc.calendar;
  const tz = sc.tz;
  setDisplayTimeZone(tz);
  const now = new Date(over.now ?? sc.now);
  const { store, db } = storeFrom(cal);
  const offersDb = openDb(':memory:', OFFERS_DDL);
  // BENCH WIRING (not vendored code): earlier offers keep their ids, so a yes to slot 283 finds slot 283's time.
  const seed = offersDb.prepare('INSERT INTO slot_offers (n, created_at, start_ms, end_ms, context) VALUES (?, ?, ?, ?, ?)');
  for (const o of over.offers ?? []) seed.run(o.id, now.toISOString(), Date.parse(o.start), Date.parse(o.end), 'carried from before this event');
  const offers = new OffersStore(offersDb);
  const operatorAddresses = over.operatorAddresses ?? sc.world.operatorAddresses;
  const others = sc.world.colleagueCalendars ? colleagueReads(sc.world.colleagueCalendars) : undefined;
  const avail = availabilityDeps({
    policy: parseSchedulingPolicy(sc.world.schedulingPolicy), tz,
    eventsInRange: (s, e) => store.eventsInRange(s, e), ledgerRows: () => [], syncStatus: () => store.syncStatus(), syncProblem: describeSyncStatus(store.syncStatus()),
    internalDomain: sc.world.internalDomain,
    familyView: { rules: familyRulesOf(over.familyRules ?? sc.world.familyRules) }, operatorAddresses,
    now: () => now,
    ...(others ? { freeBusy: others.freeBusy } : {}),
  });
  const calendly = over.calendly ?? sc.calendly;
  // THE LIVE PLAN, composed as wire.ts makeAgentToolDeps composes it for production: the shape and amendments reassigned by
  // amendPlan, read through thunks; his mailed windows' bounds from the offer rows of bob_offers (none in any scenario yet);
  // the rule readers ruleReadersOf builds (his hours from the check policy; the bench has no preferences on record, as the
  // eval runner has none), with the live shape and amendments on them.
  const check = {
    policy: avail.policy, tz: avail.tz, now: () => now, eventsInRange: avail.eventsInRange, toEpoch: avail.toEpoch,
    familyView: avail.familyView, operatorAddresses: avail.operatorAddresses ?? operatorAddresses, coverageEndMs: avail.coverageEndMs ?? null, recentWrites: () => [],
    ...(avail.transition ? { transition: avail.transition } : {}),
    ...(others ? { readOthers: others.readOthers } : {}),
  };
  const planRow = sc.plan as unknown as { bobOffers?: Array<{ id: number }> };
  const asAmended = planAsAmended(sc, over.amendments);
  let shapeNow = asAmended.askShape;
  let amendmentsNow: readonly PlanAmendment[] = asAmended.amendments;
  const bobWindows = (): Span[] => (planRow.bobOffers ?? []).flatMap((b) => { const o = offers.byN(b.id); return o ? [{ start: new Date(o.startMs).toISOString(), end: new Date(o.endMs).toISOString() }] : []; });
  const rules: RuleReaders = { ...ruleReadersOf({ check }), amendmentsNow: () => amendmentsNow, shapeNow: () => shapeNow };
  const amendPlan: World['amendPlan'] = ({ field, value, hard, words }) => {
    shapeNow = shapeAfterAmend(shapeNow, field, value, hard);
    amendmentsNow = [...amendmentsNow, { at: now.toISOString(), field, value, hard, words }];
    return { shape: shapeNow, amendments: amendmentsNow };
  };
  const lookups = makeLookupDeps({
    rules, shapeNow: () => shapeNow, amendmentsNow: () => amendmentsNow,
    sacrificed: (span, blockers) => allSacrificed(declaredSacrifices({ amendments: [...amendmentsNow] }), bobWindows(), span, blockers),
    plan: sc.plan, shape: asAmended.askShape, tz, now: () => now, offers,
    availability: { ...avail, now: () => now },
    check,
    // The eval runner's own routing of the two Calendly endpoints to the two captures.
    fetchJson: async (url) => {
      if (!calendly) throw new Error('no Calendly capture in this scenario');
      return url.includes('/event_types') && !url.includes('/calendar/range') ? calendly.eventTypes : calendly.range;
    },
    log: { info: () => {}, warn: () => {} },
  });
  const minted = (): Array<{ id: number; start: string; end: string }> => (offersDb.prepare('SELECT n, start_ms, end_ms FROM slot_offers ORDER BY n').all() as Array<{ n: number; start_ms: number; end_ms: number }>)
    .map((r) => ({ id: r.n, start: new Date(r.start_ms).toISOString(), end: new Date(r.end_ms).toISOString() }));
  return { tz, now, fmt: (iso) => localDateTime(iso, tz), offers, minted, lookups, availability: avail, amendPlan, close: () => { db.close(); offersDb.close(); } };
}

export function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

export const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
