/**
 * WHAT THE THREE CONDITIONS SHARE: the state as the vendored assembler builds it, the model call recorded per step, the
 * outward tools that only record (propose, ask, book, tell_bob and the plan records never reach anyone), and the
 * snapshot of the run's context the graders read (docs/study-design.md sections 4, 7 and 8).
 */
import { followUpDue } from '../harness/src/capabilities/email/scheduler-agent/follow-up.js';
import { assemblePlanState, type PlanState } from '../harness/src/capabilities/email/scheduler-agent/state.js';
import type { Decision, RunContext, SlotFact, ToolDeps } from '../harness/src/capabilities/email/scheduler-agent/tools.js';
import type { ModelCall, ModelFn } from '../models/types.js';
import { resolveEvent, type EventWorld, type Scenario } from '../scenarios/load.js';
import { planAsAmended, type World } from './world.js';
import { declaredSacrifices, requiresOf, type DeclaredSacrifice } from '../harness/src/capabilities/calendar/plans.js';
import type { BumpOutcome } from '../harness/src/capabilities/email/scheduler-agent/bump.js';
import type { FollowUpFact } from '../harness/src/capabilities/email/scheduler-agent/follow-up.js';
import type { RawContextSnapshot } from './raw-map.js';

/**
 * THE SYSTEM PROMPT, THE SAME IN EVERY CONDITION. Winnie's production system prompt is her identity payload (Bob's
 * private identity files, renderSystemPrompt in payload/profiles.ts), which is not vendored; the loop's own prompt
 * (prompt.ts agentPrompt, the user turn) carries every scheduling rule. This line stands in for the payload.
 */
export const BENCH_SYSTEM = "You are Winnie, a virtual executive assistant who schedules meetings for Bob. Follow the rules and the answer format in the user's message exactly.";

/** The event's world: an index resolves standalone (the scenario's own record of earlier events). */
export function eventWorld(sc: Scenario, ev: number | EventWorld): EventWorld {
  return typeof ev === 'number' ? resolveEvent(sc, ev) : ev;
}

/**
 * The state at an event, as the vendored assembler builds it: the plan row with the carry's yeses and outs on it, the
 * thread, her outbound, Bob's lines, and her offers with their times (so SENT names each slot's time).
 */
export function planState(sc: Scenario, evIn: number | EventWorld): PlanState {
  const ev = eventWorld(sc, evIn);
  // The plan row as amended before this event (carried amendments, and the shape they change), as production's row is.
  const plan = { ...sc.plan, acceptances: ev.acceptances, declines: ev.declines, ...planAsAmended(sc, ev.amendments) };
  return assemblePlanState({
    plan: plan as never, thread: ev.thread, sent: ev.sent, bob: ev.bob, openCards: ev.openCards, links: ev.links,
    operatorAddresses: sc.world.operatorAddresses, agentAddresses: sc.world.agentAddresses, now: new Date(ev.now), tz: sc.tz,
    offered: ev.offered.map((o) => ({ id: o.id, startMs: Date.parse(o.start), endMs: Date.parse(o.end) })),
  });
}

export interface CallRecord extends ModelCall { n: number; reason: string; prompt: string; system: string; error?: string }

/** The loop's `model: (prompt, reason) => text` seam over an adapter, recording every call. */
export function recordingModel(fn: ModelFn, model: string, system: string, calls: CallRecord[]): (prompt: string, reason: string) => Promise<string> {
  return async (prompt, reason) => {
    const n = calls.length + 1;
    try {
      const r = await fn(prompt, system, { model });
      calls.push({ ...r, n, reason, prompt, system });
      return r.text;
    } catch (e) {
      calls.push({ n, reason, prompt, system, text: '', inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, model, latencyMs: 0, stopReason: null, costUsd: 0, error: String(e) });
      throw e;
    }
  };
}

/** What an outward tool would have done; nothing reached anyone. */
export interface Would { step: number; tool: string; detail: Record<string, unknown> }

/**
 * The outward and record-keeping deps, recording only (as the eval runner's, plus the slot times for the record).
 * `standing`: the plan's yeses and outs carried in from earlier events. PlansStore.recordAcceptance and recordDecline
 * return EVERY standing yes and out, not only this run's, and the loop syncs the plan to what they return
 * (tools.ts syncAcceptances); seeded empty, a second party's yes at a later event erased the first party's carried yes
 * and the booking was refused (found building s09-yes-then-counter, 2026-11-05; no one-party scenario could show it).
 */
export function recordingDeps(world: World, would: Would[], step: () => number, standing: { acceptances?: ReadonlyArray<{ party: string; slot: number }>; declines?: ReadonlyArray<{ party: string }> } = {}): Omit<ToolDeps, 'readThread' | 'checkCalendar' | 'readLink' | 'log'> {
  const yeses = new Map<string, number>((standing.acceptances ?? []).map((a) => [a.party.trim().toLowerCase(), a.slot]));
  const outs = new Set<string>((standing.declines ?? []).map((d) => d.party.trim().toLowerCase()));
  for (const o of outs) yeses.delete(o);
  const time = (n: number): string => { const o = world.offers.byN(n); return o ? new Date(o.startMs).toISOString() : '?'; };
  const push = (tool: string, detail: Record<string, unknown>): void => { would.push({ step: step(), tool, detail }); };
  return {
    propose: async (req) => { push('propose', { to: req.to, slots: req.slots.map((n) => ({ id: n, start: time(n) })), ...(req.note ? { note: req.note } : {}) }); return { carded: true, detail: '(bench: would card)' }; },
    ask: async (req) => { push('ask', { to: req.to, text: req.text, ...(req.template ? { template: req.template } : {}) }); return { carded: true, detail: '(bench: would card)' }; },
    book: async (req) => { push('book', { slot: req.slot, start: time(req.slot), attendees: req.attendees, why: req.why }); return { carded: true, detail: '(bench: would card)' }; },
    recordYes: async (req) => { push('record_yes', { ...req }); yeses.set(req.party, req.slot); return [...yeses].map(([party, slot]) => ({ party, slot })); },
    withdrawYes: async (req) => { push('withdraw_yes', { ...req }); yeses.delete(req.party); return [...yeses].map(([party, slot]) => ({ party, slot })); },
    recordNo: async (req) => { push('record_no', { ...req }); },
    recordOut: async (req) => { push('record_out', { ...req }); yeses.delete(req.party); outs.add(req.party); return { out: [...outs], yes: [...yeses].map(([party, slot]) => ({ party, slot })) }; },
    closePlan: async (req) => { push('close_plan', { ...req }); return { released: 0 }; },
    tellBob: async (t) => { push('tell_bob', { text: t }); return true; },
    // THE FOLLOW-UP TIMER, as a recorder (Bob's ruling on the walkthrough, 2026-11-07, group 3 question 2): the due time is
    // read as production reads it (followUpDue: Bob's wall clock, off his quiet days; Sunday is the bench's quiet day, as the
    // silent-sunday scenario states), recorded as a would-be, and nothing is scheduled. Before this the tool was refused
    // ("no follow-up timer is wired here"), as in Winnie's eval runner, and the refusal plus the promise guard's second
    // refusal ended silent-sunday C runs stuck: a bench artifact, not a harness miss.
    setFollowUp: async ({ at, why }) => {
      const due = followUpDue(at, world.now, world.tz, [0]);
      if (!due.ok) return due;
      push('follow_up', { dueAt: due.dueAt, why, ...(due.moved ? { moved: due.moved } : {}) });
      return { ok: true, dueAt: due.dueAt, ...(due.moved ? { moved: due.moved } : {}) };
    },
    // BOB'S AMENDMENT, as a recorder (wired the way setFollowUp is, decision 15): the tool hands over its arguments with the
    // value already read (readAmendValue, and a sacrifice's events with their titles); the world's live plan takes it as
    // production's store does (World.amendPlan: shapeAfterAmend, the amendment appended), so the next lookup searches the
    // amended plan; the would-be records both; and the tool gets production's success answer, the shape after it, so its
    // own context update (goal, amendments, sacrifices, requires) runs as live.
    amend: async ({ field, value, hard, words }) => {
      const after = world.amendPlan({ field, value, hard, words });
      push('amend', { field, value, hard, words, shape: after.shape });
      return { ok: true, shape: after.shape };
    },
  };
}

/** The part of the run's context a grader needs, copied at the moment an action was chosen. */
export interface ContextSnapshot {
  known: SlotFact[];
  linkCoverage: Record<string, number[]>;
  /** A party's windows verified this run (Winnie 34013da, unit D): the free slot ids inside them, which book counts as their yes. */
  windowCoverage?: Record<string, number[]>;
  parties: Array<{ address: string; name: string; acceptedSlot?: number; out?: string; said: Array<{ text: string; bobOnly?: boolean }> }>;
  offeredWhy: Array<[number, string]>;
  proposedThisRun: Record<string, string[]>;
  closed?: string;
  bookingCarded?: boolean;
  /**
   * THE FIELDS WINNIE bd29f14 ADDED TO THE RUN'S CONTEXT, which its guards read (askedRefusal, uncheckedOfferRefusal,
   * notFreeNow's sacrifices, everyoneCovers' requires, markPast's now, promiseRefusal's follow-up). Absent on a line
   * written before the re-vendor; contextFrom then rebuilds each as startContext(state) would.
   */
  askedThisRun?: Record<string, string>;
  checkedOffers?: number[];
  nowMs?: number;
  sacrifices?: DeclaredSacrifice[];
  requires?: 'everyone' | 'anyone-plus-my-word';
  trigger?: string;
  nearOffered?: Array<[number, number]>;
  bumps?: Array<[string, BumpOutcome]>;
  followUp?: FollowUpFact;
  /** Condition A (raw tools): the listings, recipients, instants and implied yeses behind the mapped decision (conditions/raw-map.ts). */
  raw?: RawContextSnapshot;
}

export function snapshot(ctx: RunContext): ContextSnapshot {
  return {
    known: [...ctx.known.values()].map((s) => ({ ...s })),
    linkCoverage: Object.fromEntries([...ctx.linkCoverage].map(([k, v]) => [k, [...v]])),
    ...(ctx.windowCoverage?.size ? { windowCoverage: Object.fromEntries([...ctx.windowCoverage].map(([k, v]) => [k, [...v.slots]])) } : {}),
    parties: ctx.state.parties.map((p) => ({ address: p.address, name: p.name, ...(p.acceptedSlot !== undefined ? { acceptedSlot: p.acceptedSlot } : {}), ...(p.out ? { out: p.out } : {}), said: p.said.map((m) => ({ text: m.text, ...(m.bobOnly ? { bobOnly: true } : {}) })) })),
    offeredWhy: [...ctx.offeredWhy],
    proposedThisRun: Object.fromEntries([...ctx.proposedThisRun].map(([k, v]) => [String(k), [...v]])),
    ...(ctx.closed ? { closed: ctx.closed } : {}),
    ...(ctx.bookingCarded ? { bookingCarded: true } : {}),
    ...(ctx.askedThisRun ? { askedThisRun: Object.fromEntries(ctx.askedThisRun) } : {}),
    ...(ctx.checkedOffers ? { checkedOffers: [...ctx.checkedOffers] } : {}),
    ...(ctx.nowMs !== undefined ? { nowMs: ctx.nowMs } : {}),
    ...(ctx.sacrifices ? { sacrifices: ctx.sacrifices.map((x) => ({ ...x, events: x.events.map((e) => ({ ...e })) })) } : {}),
    ...(ctx.requires ? { requires: ctx.requires } : {}),
    ...(ctx.trigger !== undefined ? { trigger: ctx.trigger } : {}),
    ...(ctx.nearOffered ? { nearOffered: [...ctx.nearOffered] } : {}),
    ...(ctx.bumps ? { bumps: [...ctx.bumps].map(([k, v]) => [k, { ...v }] as [string, BumpOutcome]) } : {}),
    ...(ctx.followUp ? { followUp: { ...ctx.followUp } } : {}),
  };
}

/** A RunContext rebuilt from a snapshot, for the harness's own predicates (graders/). */
export function contextFrom(snap: ContextSnapshot, state: PlanState): RunContext {
  return {
    state: { ...state, parties: state.parties.map((p) => { const s = snap.parties.find((x) => x.address === p.address); const { acceptedSlot: _a, out: _o, ...rest } = p; void _a; void _o; return { ...rest, ...(s?.acceptedSlot !== undefined ? { acceptedSlot: s.acceptedSlot } : {}), ...(s?.out ? { out: s.out } : {}) }; }) },
    known: new Map(snap.known.map((s) => [s.id, s])),
    linkCoverage: new Map(Object.entries(snap.linkCoverage).map(([k, v]) => [k, new Set(v)])),
    // The basis (their words, for the card) is not kept: the graders ask only which slots a party's windows cover.
    windowCoverage: new Map(Object.entries(snap.windowCoverage ?? {}).map(([k, v]) => [k, { slots: new Set(v), basis: [] }])),
    offeredWhy: new Map(snap.offeredWhy as Array<[number, never]>),
    proposedThisRun: new Map(Object.entries(snap.proposedThisRun).map(([k, v]) => [Number(k), new Set(v)])),
    cards: [],
    ...(snap.closed ? { closed: snap.closed } : {}),
    ...(snap.bookingCarded ? { bookingCarded: true } : {}),
    // A field a pre-re-vendor line lacks rebuilds to startContext's own default (loop.ts): empty asks, checks and near
    // pairs; the plan's own sacrifices, requirement and follow-up; no now and no trigger (startContext without them); no bumps.
    askedThisRun: new Map(Object.entries(snap.askedThisRun ?? {})),
    checkedOffers: new Set(snap.checkedOffers ?? []),
    nearOffered: new Map(snap.nearOffered ?? []),
    sacrifices: snap.sacrifices ?? declaredSacrifices({ amendments: state.amendments ?? [] }),
    requires: snap.requires ?? requiresOf({ amendments: state.amendments ?? [] }),
    ...(snap.nowMs !== undefined ? { nowMs: snap.nowMs } : {}),
    ...(snap.trigger !== undefined ? { trigger: snap.trigger } : {}),
    ...(snap.bumps ? { bumps: new Map(snap.bumps) } : {}),
    ...(snap.followUp ? { followUp: snap.followUp } : state.followUp ? { followUp: { dueAt: state.followUp.dueAt, why: state.followUp.why } } : {}),
  };
}

/** One action the model chose, with the context it was chosen in and what the tool layer did with it. */
export interface ActionRecord {
  step: number;
  decision: Decision;
  context: ContextSnapshot;
  /** The observation or refusal text, as the model read it back (absent in condition A0: nothing ran). */
  result?: string;
  refused: boolean;
  shadowed: Array<{ site: string; refusal: string; outcome: 'proceeded' | 'faked' }>;
  /** Condition A: the raw tool call the decision was mapped from (conditions/raw-map.ts), kept beside it. */
  raw?: { tool: string; args: Record<string, unknown> };
}

/** A: raw tools (conditions/raw.ts); A0: the one-action bare prompt (conditions/bare.ts); B and C: the loop. */
export type Condition = 'A' | 'A0' | 'B' | 'C';

export interface ConditionResult {
  condition: Condition;
  calls: CallRecord[];
  steps: Array<{ n: number; raw: string; parsed: Decision | null; unreadable?: string; result: string; refused: boolean }>;
  actions: ActionRecord[];
  outcome: string;
  would: Would[];
  cap: number;
  /** Facts precomputed for condition A0, as the tools rendered them. */
  facts?: Array<{ tool: string; args: Record<string, unknown>; result: string }>;
  /** Every offer row the world held at the end of the run (carried to the next event of a sequence). */
  minted?: Array<{ id: number; start: string; end: string }>;
  error?: string;
}
