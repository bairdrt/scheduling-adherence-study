/**
 * THE SCENARIO FORMAT (scenarios/README.md; docs/study-design.md section 6). One folder per scenario:
 *   scenario.json   the frozen world and the events, with an expectation per event
 *   calendar.json   Bob's calendar for the window, anonymized (tools/capture-calendar.ts writes it)
 *   calendly-*.json captured booking-link responses, when a party shared a link
 * loadScenario validates the shape and resolves the files; it throws with the field that is wrong.
 *
 * TWO SCHEMAS. Schema 1 (plan 39): each event carries the whole thread, SENT and Bob's lines as they stood at it.
 * Schema 2 (phase 2a): `initial` holds the world before event 0, and each event carries only what is NEW at it (`add`:
 * a reply, a Bob line, nothing for a timer) plus, for a captured scenario, what Winnie's recorded run did at it
 * (`capture`). The loader normalizes schema 1 into schema 2 (initial = event 0's snapshot), so everything downstream
 * reads one shape. resolveEvent builds the world AT an event: standalone (every earlier event's add and capture
 * applied), or from a carry the runner built out of what the model under test did (conditions/sequence.ts).
 */
import fs from 'node:fs';
import path from 'node:path';
import type { CalendarFixture } from '../conditions/world.js';
import type { BobLine, SentState, StateMessage } from '../harness/src/capabilities/email/scheduler-agent/state.js';
import type { PlanAmendment } from '../harness/src/capabilities/calendar/plans.js';
import { personaReply, PERSONAS, type Persona } from './personas.js';

export type DecisionClass = 'propose' | 'ask_party' | 'ask_bob' | 'book' | 'wait' | 'close' | 'tell_bob';
const CLASSES: readonly DecisionClass[] = ['propose', 'ask_party', 'ask_bob', 'book', 'wait', 'close', 'tell_bob'];

export interface Expectation {
  /** The decision class the run should end in for this event (design section 7, "Outcome"). */
  decisionClass: DecisionClass;
  /** Other classes that also count as a match, ONLY where the expectation is not settled; `notes` says why (Bob reviews). */
  alsoAccept?: DecisionClass[];
  /**
   * Condition A answers with ONE action, so a class that takes two steps in the loop (record_yes then book) cannot be
   * reached there. When set, A matches when its one action is one of these tools; B and C are graded on the class.
   */
  firstStep?: string[];
  /** Who the outward action must reach: every address here must be a recipient. */
  mustReach?: string[];
  /** The slots (start instants, ISO UTC) an expected proposal or booking may carry; empty or absent means any. */
  slotStarts?: string[];
  /**
   * Instants (ISO, as slotStarts) Bob ruled, in the scenario review, a yes from the party's words, where the harness's
   * yes-guard would refuse it (S7: a bare "7" on a meal plan). graders/slots.ts grades a record_yes on one of them as
   * right on time and id; V2 still needs the yes recorded before a booking.
   */
  yesRuled?: string[];
  /** "persona": the expected slot is the one the persona's reply chose from her latest proposal (filled by resolveEvent). */
  slotFrom?: 'persona';
  /** Spans (ISO UTC) every proposed slot must lie inside, at least one proposed (the windows scenario). */
  slotWithin?: Array<{ start: string; end: string }>;
  /** A regex (case-insensitive) the run's tell_bob must match, when the class requires telling Bob something. */
  tellBobMustMatch?: string;
  /**
   * V4, wrong zone (design section 7): the instant a correctly converted time lands on; V4 fires on a record_yes or a
   * book whose slot starts one of `wrongOffsetsMin` away from it (default -60 and +60). "persona" takes the persona's slot.
   */
  v4?: { expectedStart: string; wrongOffsetsMin?: number[] };
  /** The adherence rules this event exercises (V1..V9), for the report; graders run every V regardless. */
  rulesInPlay: string[];
  /** Where the expectation comes from (a decision Bob settled, a recorded eval run, a proof-round capture). */
  basis: string;
  /** Anything uncertain about the expectation or the world, for Bob's review. Never silently guessed. */
  notes?: string;
  /**
   * Declared loosely here (the graders own the exact types: BobDecidesEntry, Constraint; tests/scenarios-synthetic.test.ts
   * parses every scenario's entries through them).
   * V6 (graders/bob-decides.ts, whose header documents the shape): what at this event is Bob's to decide, as a bare kind
   * ("place", "constraint", "tradeoff", "goal") or {kind, what, settledBy, argsMatch, reportMatch, askMatch}.
   */
  bobDecides?: Array<string | { kind: string; what?: string; settledBy?: string[]; argsMatch?: string; reportMatch?: string; askMatch?: string }>;
  /**
   * V7 (graders/constraints.ts): constraints STATED at this event (or at `statedAt`, -1 for initial), each with an `id`;
   * they stay in force for every later event and are written once.
   */
  constraints?: Array<{ id: string; statedAt?: number; what?: string; weekdays?: string[]; earliest?: string; latest?: string; durationMin?: number; mode?: string; requiredAttendees?: string[]; maxProposals?: number; maxSlots?: number }>;
  /**
   * CONDITIONED (Bob, 2026-11-07, harness walkthrough): this event's grade is read only in runs where each named earlier
   * event ended in the named class (a sequence run carries the model's own earlier outcome; a booking at event 3 closes
   * the plan and the scripted later replies no longer fit). The graders run regardless; the analysis filters on it.
   */
  conditionedOn?: Array<{ event: number; decisionClass: DecisionClass }>;
  /**
   * (Edge) scenarios of design 6b: Winnie has no rule for this today, so the expectation is what a careful assistant would
   * do, and a miss is read as a build request, not a model error. `notes` says what her rules do not cover.
   */
  edge?: boolean;
}

/** A time she offered on the plan, as the offer record holds it. */
export interface OfferedTime { id: number; start: string; end: string }
export interface PlanAcceptance { party: string; slot: number; at: string }
export interface PlanDecline { party: string; words: string; at: string }

/** A message on the thread. `persona` instead of `text`: the words are composed from her latest proposal to that party. */
export interface ThreadMessageInput { from: string; at: string; text?: string; persona?: Persona; bobOnly?: boolean }

/** The state a plan carries between events: her outbound, the offers behind it, every yes, every out, a close. */
export interface PlanCarry {
  sent: SentState[];
  offered: OfferedTime[];
  acceptances: PlanAcceptance[];
  declines: PlanDecline[];
  openCards: Array<{ id: string; type: string; summary: string }>;
  closed?: string;
  /**
   * Bob's amendments an earlier event's run made (the amend tool), oldest first, as production's plan row carries them
   * (PlansStore.amend). On top of the scenario plan's own `amendments`; the shape they change is derived from them
   * (conditions/world.ts planAsAmended), as the row's ask_shape is the shape after each.
   */
  amendments?: PlanAmendment[];
}

export interface EventInput {
  index: number;
  /** What kind of event: a party's message, a Bob line, a timer firing, or the plan opening on Bob's mail. */
  kind: 'reply' | 'bob' | 'timer' | 'open';
  /** The instant of this event; the scenario's `now` when absent. Every clock in the event's run is this. */
  now?: string;
  /** "What just happened", the loop's trigger text. */
  trigger: string;
  /** What is new at this event. */
  add?: { thread?: ThreadMessageInput[]; bob?: BobLine[] };
  /** What Winnie's recorded run did at this event (a captured scenario): applied when a later event is run on its own. */
  capture?: Partial<PlanCarry>;
  /** Extra facts condition A precomputes for this event, beyond read_link per link and check_calendar over the window. */
  facts?: Array<{ tool: 'check_calendar' | 'read_link'; args: Record<string, unknown> }>;
  expect: Expectation;
}

export interface ScenarioPlan {
  id: number;
  subject: string;
  counterpart: string;
  parties: string[];
  partyNames: Record<string, string>;
  askShape: Record<string, unknown>;
  holds: unknown[];
  colleagues?: Array<{ email: string; required: boolean }>;
  /** The plan's follow-up timer as the plan row holds it (a timer event's plan), rendered under FOLLOW-UP. */
  followUp?: { dueAt: string; why: string; setAt?: string };
}

export interface ScenarioWorld {
  calendar: string;
  schedulingPolicy: Record<string, unknown>;
  familyRules: 'default' | Record<string, unknown>;
  operatorAddresses: string[];
  agentAddresses: string[];
  internalDomain: string;
  calendly?: { party: string; url: string; eventTypes: string; range: string };
  /** Colleagues' calendars as busy spans (ISO), read as free/busy; absent: no colleague calendar is readable (as in plan 39). */
  colleagueCalendars?: Record<string, Array<{ start: string; end: string }>>;
}

export interface ScenarioInitial extends Partial<PlanCarry> {
  thread: ThreadMessageInput[];
  bob: BobLine[];
  links: Record<string, string>;
}

/** Schema 1's event: the whole snapshot at it. */
interface EventV1 {
  index: number; trigger: string; thread: StateMessage[]; sent: SentState[]; bob: BobLine[];
  openCards: Array<{ id: string; type: string; summary: string }>; links: Record<string, string>; expect: Expectation;
}

interface ScenarioFileBase {
  id: string;
  title: string;
  /** Where the world came from (a captured plan, a synthetic case). */
  source: string;
  now: string;
  tz: string;
  world: ScenarioWorld;
  plan: ScenarioPlan;
  /** Bob's read of the expectations (the synthetic set carries one): reviewed yet, the judgment call to settle, if any, and his answer once given. */
  review?: { reviewed: boolean; question?: string; answer?: string };
}
export interface ScenarioFileV1 extends ScenarioFileBase { schema: 1; events: EventV1[] }
export interface ScenarioFileV2 extends ScenarioFileBase { schema: 2; initial: ScenarioInitial; events: EventInput[] }
/** Every scenario after loading: schema 2's shape (schema 1 normalized). */
export type ScenarioFile = ScenarioFileV2;

export interface Scenario extends ScenarioFileV2 {
  /** The schema the file was written in. */
  fileSchema: 1 | 2;
  dir: string;
  calendar: CalendarFixture;
  calendly?: { eventTypes: unknown; range: unknown };
}

/** The world at one event, everything a condition needs (the old per-event snapshot, plus the carry). */
export interface EventWorld extends PlanCarry {
  index: number;
  kind: EventInput['kind'];
  now: string;
  trigger: string;
  thread: StateMessage[];
  bob: BobLine[];
  links: Record<string, string>;
  /** What is new at this event, resolved (persona words composed), for condition A's transcript. */
  added: { thread: StateMessage[]; bob: BobLine[] };
  facts: NonNullable<EventInput['facts']>;
  /** The expectation, with persona-derived slots filled in. */
  expect: Expectation;
  /** The offer a persona's reply chose, when it chose one. */
  personaSlot?: OfferedTime;
  /** Where the carry came from: the scenario's own record of earlier events, or what the model under test did. */
  carriedFrom: 'capture' | 'run' | 'run+capture';
}

/** Kept for callers of phase 1: an event index's expectation and trigger. */
export type ScenarioEvent = EventInput;

const SCENARIOS = path.resolve(path.dirname(new URL(import.meta.url).pathname));

function need(cond: unknown, what: string): asserts cond {
  if (!cond) throw new Error(`scenario: ${what}`);
}

function validateExpect(e: Expectation | undefined, at: string, parties: readonly string[]): void {
  need(e && typeof e.decisionClass === 'string' && Array.isArray(e.rulesInPlay), `${at}.expect needs decisionClass and rulesInPlay`);
  need(CLASSES.includes(e.decisionClass), `${at}.expect.decisionClass ${e.decisionClass} is not one of ${CLASSES.join(', ')}`);
  for (const c of e.alsoAccept ?? []) need(CLASSES.includes(c), `${at}.expect.alsoAccept names ${c}, not a class`);
  need(!e.alsoAccept?.length || (typeof e.notes === 'string' && e.notes.length > 0), `${at}.expect.alsoAccept needs notes saying why the class is not settled`);
  for (const a of e.mustReach ?? []) need(parties.includes(a), `${at}.expect.mustReach names ${a}, not a party`);
  for (const s of e.slotStarts ?? []) need(Number.isFinite(Date.parse(s)), `${at}.expect.slotStarts holds ${s}, not an instant`);
  need(e.yesRuled === undefined || (Array.isArray(e.yesRuled) && e.yesRuled.every((x) => typeof x === 'string')), `${at}.expect.yesRuled is a list of strings`);
  for (const s of e.yesRuled ?? []) need(Number.isFinite(Date.parse(s)), `${at}.expect.yesRuled holds ${s}, not an instant`);
  if (e.v4) need(e.v4.expectedStart === 'persona' || Number.isFinite(Date.parse(e.v4.expectedStart)), `${at}.expect.v4.expectedStart must be an instant or "persona"`);
  need(e.bobDecides === undefined || Array.isArray(e.bobDecides), `${at}.expect.bobDecides is a list`);
  for (const b of e.bobDecides ?? []) need(['place', 'constraint', 'tradeoff', 'goal'].includes(typeof b === 'string' ? b : b?.kind), `${at}.expect.bobDecides holds ${JSON.stringify(b)}, not place, constraint, tradeoff or goal`);
  need(e.constraints === undefined || (Array.isArray(e.constraints) && e.constraints.every((c) => c && typeof c.id === 'string' && c.id.length > 0)), `${at}.expect.constraints is a list whose every entry has an "id"`);
  need(!e.edge || (typeof e.notes === 'string' && e.notes.length > 0), `${at}.expect.edge needs notes saying what Winnie's rules do not cover`);
  for (const c of e.conditionedOn ?? []) need(c && Number.isInteger(c.event) && CLASSES.includes(c.decisionClass), `${at}.expect.conditionedOn needs {event, decisionClass}`);
}

function validateMessages(ms: unknown, at: string): void {
  need(Array.isArray(ms), `${at} is a list`);
  (ms as ThreadMessageInput[]).forEach((m, i) => {
    need(typeof m.from === 'string' && Number.isFinite(Date.parse(m.at)), `${at}[${i}] needs "from" and an ISO "at"`);
    need(typeof m.text === 'string' || (m.persona && PERSONAS.includes(m.persona)), `${at}[${i}] needs "text" or a known "persona"`);
  });
}

export function validateScenario(o: unknown): ScenarioFileV1 | ScenarioFileV2 {
  const s = o as ScenarioFileV1 | ScenarioFileV2;
  need(s && typeof s === 'object', 'not an object');
  need(s.schema === 1 || s.schema === 2, '"schema" must be 1 or 2');
  need(typeof s.id === 'string' && s.id, '"id" is required');
  need(typeof s.now === 'string' && Number.isFinite(Date.parse(s.now)), '"now" must be an ISO instant');
  need(typeof s.tz === 'string' && s.tz, '"tz" is required');
  need(s.world && typeof s.world.calendar === 'string', '"world.calendar" names the calendar fixture');
  need(Array.isArray(s.world.operatorAddresses), '"world.operatorAddresses" is a list');
  need(s.plan && Array.isArray(s.plan.parties) && s.plan.parties.length > 0, '"plan.parties" is a non-empty list');
  need(Array.isArray(s.events) && s.events.length > 0, '"events" is a non-empty list');
  need(s.review === undefined || typeof s.review.reviewed === 'boolean', '"review.reviewed" is true or false');
  need(s.review === undefined || s.review.answer === undefined || typeof s.review.answer === 'string', '"review.answer" is a string');
  if (s.schema === 1) {
    s.events.forEach((e, i) => {
      need(e.index === i, `events[${i}].index must be ${i}`);
      need(typeof e.trigger === 'string' && e.trigger, `events[${i}].trigger is required`);
      need(Array.isArray(e.thread) && Array.isArray(e.bob) && Array.isArray(e.sent), `events[${i}] needs thread, bob and sent lists`);
      validateExpect(e.expect, `events[${i}]`, s.plan.parties);
    });
    need(s.events.length === 1, 'schema 1 holds one event; a sequence of events is schema 2 (initial plus each event\'s add)');
    return s;
  }
  need(s.initial && typeof s.initial === 'object', '"initial" (the world before event 0) is required in schema 2');
  validateMessages(s.initial.thread, 'initial.thread');
  need(Array.isArray(s.initial.bob), '"initial.bob" is a list');
  let last = Date.parse(s.now);
  s.events.forEach((e, i) => {
    need(e.index === i, `events[${i}].index must be ${i}`);
    need(['reply', 'bob', 'timer', 'open'].includes(e.kind), `events[${i}].kind must be reply, bob, timer or open`);
    need(typeof e.trigger === 'string' && e.trigger, `events[${i}].trigger is required`);
    if (e.now !== undefined) {
      need(Number.isFinite(Date.parse(e.now)), `events[${i}].now must be an ISO instant`);
      need(Date.parse(e.now) >= last, `events[${i}].now is before the event it follows`);
      last = Date.parse(e.now);
    }
    if (e.add?.thread) validateMessages(e.add.thread, `events[${i}].add.thread`);
    if (e.kind === 'reply') need((e.add?.thread?.length ?? 0) > 0 || i === 0, `events[${i}] is a reply with nothing new on the thread`);
    validateExpect(e.expect, `events[${i}]`, s.plan.parties);
  });
  need(Date.parse(s.events[0]!.now ?? s.now) === Date.parse(s.now), 'events[0].now, when given, is the scenario\'s "now"');
  return s;
}

/** Schema 1 to schema 2: the one snapshot becomes `initial`, the event adds nothing. */
export function normalize(f: ScenarioFileV1 | ScenarioFileV2): ScenarioFileV2 {
  if (f.schema === 2) return f;
  const e = f.events[0]!;
  return {
    ...f, schema: 2,
    initial: { thread: e.thread, sent: e.sent, bob: e.bob, openCards: e.openCards, links: e.links },
    events: [{ index: 0, kind: 'reply', trigger: e.trigger, expect: e.expect }],
  };
}

export function loadScenario(idOrDir: string): Scenario {
  const dir = fs.existsSync(path.join(idOrDir, 'scenario.json')) ? idOrDir : path.join(SCENARIOS, idOrDir);
  const raw = validateScenario(JSON.parse(fs.readFileSync(path.join(dir, 'scenario.json'), 'utf8')));
  const file = normalize(raw);
  const calendar = JSON.parse(fs.readFileSync(path.join(dir, file.world.calendar), 'utf8')) as CalendarFixture;
  need(Array.isArray(calendar.events) && Array.isArray(calendar.syncStatus), `${file.world.calendar} needs events and syncStatus`);
  const c = file.world.calendly;
  const calendly = c ? { eventTypes: JSON.parse(fs.readFileSync(path.join(dir, c.eventTypes), 'utf8')) as unknown, range: JSON.parse(fs.readFileSync(path.join(dir, c.range), 'utf8')) as unknown } : undefined;
  return { ...file, fileSchema: raw.schema, dir, calendar, ...(calendly ? { calendly } : {}) };
}

/** Every scenario folder under scenarios/, sorted. */
export function scenarioIds(): string[] {
  return fs.readdirSync(SCENARIOS).filter((d) => fs.existsSync(path.join(SCENARIOS, d, 'scenario.json'))).sort();
}

/* ---------------------------------------------------------------- the world at an event */

export const emptyCarry = (): PlanCarry => ({ sent: [], offered: [], acceptances: [], declines: [], openCards: [] });

/** The carry before event 0: the scenario's `initial`. */
export function initialCarry(sc: Scenario): PlanCarry {
  const i = sc.initial;
  return { sent: [...(i.sent ?? [])], offered: [...(i.offered ?? [])], acceptances: [...(i.acceptances ?? [])], declines: [...(i.declines ?? [])], openCards: [...(i.openCards ?? [])], ...(i.closed ? { closed: i.closed } : {}) };
}

/** A carry with a delta applied on top (lists appended; an offered id replaces its earlier time; a close stays closed). */
export function mergeCarry(base: PlanCarry, d: Partial<PlanCarry> | undefined): PlanCarry {
  if (!d) return base;
  const offered = new Map(base.offered.map((o) => [o.id, o]));
  for (const o of d.offered ?? []) offered.set(o.id, o);
  const closed = base.closed ?? d.closed;
  return {
    sent: [...base.sent, ...(d.sent ?? [])], offered: [...offered.values()].sort((a, b) => a.id - b.id),
    acceptances: [...base.acceptances, ...(d.acceptances ?? [])], declines: [...base.declines, ...(d.declines ?? [])],
    openCards: d.openCards ?? base.openCards, ...(closed ? { closed } : {}),
    ...(base.amendments?.length || d.amendments?.length ? { amendments: [...(base.amendments ?? []), ...(d.amendments ?? [])] } : {}),
  };
}

const lowerBare = (a: string): string => a.trim().toLowerCase().replace(/^.*<([^>]+)>.*$/, '$1');

/** Her latest proposal to `party` whose mail went out, with the offer times behind it, sorted by start. */
export function latestOffersTo(party: string, carry: PlanCarry): OfferedTime[] {
  const who = lowerBare(party);
  const props = carry.sent.filter((s) => s.what === 'proposal' && s.wentOut && (s.to.length === 0 || s.to.some((t) => lowerBare(t) === who)));
  const last = props[props.length - 1];
  if (!last) return [];
  const byId = new Map(carry.offered.map((o) => [o.id, o]));
  return last.slots.flatMap((n) => (byId.has(n) ? [byId.get(n)!] : [])).sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}

/** A message's words: its own text, or the persona's reply composed from her latest proposal to the sender. */
function resolveMessage(m: ThreadMessageInput, carry: PlanCarry, tz: string): { msg: StateMessage; chose?: OfferedTime } {
  const base = { from: m.from, at: m.at, ...(m.bobOnly ? { bobOnly: true } : {}) };
  if (m.text !== undefined) return { msg: { ...base, text: m.text } };
  const offers = latestOffersTo(m.from, carry);
  const r = personaReply(m.persona!, offers, tz);
  return { msg: { ...base, text: r.text ?? '' }, ...(r.chose ? { chose: r.chose } : {}) };
}

/**
 * THE WORLD AT EVENT k. `carry` is the plan's state after event k-1 (the runner passes what the model did); absent, the
 * scenario's own record is used: initial, then every earlier event's add and capture. Thread and Bob's lines accumulate
 * from the scenario (they are the world's, not the model's); the persona's words are composed from the carry.
 */
export function resolveEvent(sc: Scenario, k: number, carried?: { carry: PlanCarry; thread: StateMessage[]; bob: BobLine[]; from: 'run' | 'run+capture' }): EventWorld {
  const ev = sc.events[k];
  if (!ev) throw new Error(`${sc.id} has no event ${k}`);
  let carry: PlanCarry; let thread: StateMessage[]; let bob: BobLine[];
  if (carried) {
    ({ carry, thread, bob } = carried);
  } else {
    carry = initialCarry(sc);
    thread = sc.initial.thread.map((m) => resolveMessage(m, carry, sc.tz).msg);
    bob = [...sc.initial.bob];
    for (let j = 0; j < k; j += 1) {
      const e = sc.events[j]!;
      thread = [...thread, ...(e.add?.thread ?? []).map((m) => resolveMessage(m, carry, sc.tz).msg)];
      bob = [...bob, ...(e.add?.bob ?? [])];
      carry = mergeCarry(carry, e.capture);
    }
  }
  const resolved = (ev.add?.thread ?? []).map((m) => resolveMessage(m, carry, sc.tz));
  const personaSlot = resolved.find((r) => r.chose)?.chose;
  const addedThread = resolved.map((r) => r.msg);
  const addedBob = ev.add?.bob ?? [];
  const expect: Expectation = { ...ev.expect };
  if (ev.expect.slotFrom === 'persona') {
    if (!personaSlot) throw new Error(`${sc.id} event ${k}: the expectation takes the persona's slot, and the persona chose none (no proposal of hers to reply to)`);
    expect.slotStarts = [personaSlot.start];
  }
  if (ev.expect.v4?.expectedStart === 'persona') {
    if (!personaSlot) throw new Error(`${sc.id} event ${k}: V4 takes the persona's slot, and the persona chose none`);
    expect.v4 = { ...ev.expect.v4, expectedStart: personaSlot.start };
  }
  return {
    index: k, kind: ev.kind, now: ev.now ?? sc.now, trigger: ev.trigger,
    thread: [...thread, ...addedThread], bob: [...bob, ...addedBob], links: { ...sc.initial.links },
    added: { thread: addedThread, bob: addedBob }, facts: ev.facts ?? [], expect,
    ...carry, ...(personaSlot ? { personaSlot } : {}), carriedFrom: carried ? carried.from : 'capture',
  };
}
