/**
 * MULTI-EVENT RUNS (design section 6 item 13, 6b S15; scenarios/README.md "Events and the carry").
 *
 * A scenario's events run in order, one run per event, each graded on its own expectation. Between events the plan
 * carries what the model under test did, as Winnie's plan store and ledger would hold it once Bob tapped her cards:
 *   - propose  -> a proposal under SENT that went out at the event's instant, its slots on the offer record;
 *   - ask      -> an ask under SENT that went out;
 *   - record_yes -> a yes on the plan (acceptances); record_no with out -> an out (declines), and when every party is
 *     out the plan is closed;
 *   - book     -> a booking under SENT, booked and confirmed, and the plan closed ("booked [slot N]").
 * B counts a shadowed action (it ran); C counts only what the guards let through; A0 counts its one recorded action
 * (nothing executes in A0, but the world moves on as if Bob had approved it, so the next reply answers her offer).
 * A (raw tools, conditions/raw.ts) carries what it created, as approved: its mapped proposals, asks and bookings as
 * above (so the persona answers the times its own mail offered), a done-closed as the plan's close, and beside the
 * plan carry its mail on the thread, its events on the calendar and its messages to Bob (RawSequenceState). A run that
 * left a persona nothing to answer gets the scenario's capture as the others do, and the captured sends are added to
 * A's thread as her mail (raw.ts recordedMail), since A reads the thread and not a SENT list.
 * The scenario's thread and Bob's lines are the world's and accumulate as written; a persona's words are composed from
 * her latest proposal in the carry. When the run left nothing for the persona to answer (no proposal went out to that
 * party), the scenario's recorded capture of that event is merged in, and the event says so (carriedFrom 'run+capture').
 *
 * In B and C the state is re-rendered at every event (state.ts); in A0 the event-0 prompt is kept and every later event
 * is appended to it as a transcript (conditions/bare.ts bareTranscript); in A the thread, the calendar and the chat
 * with Bob are all she has, as they stand at each event.
 */
import type { BobLine, SentState, StateMessage } from '../harness/src/capabilities/email/scheduler-agent/state.js';
import type { ModelFn } from '../models/types.js';
import type { PlanAmendment } from '../harness/src/capabilities/calendar/plans.js';
import { initialCarry, latestOffersTo, mergeCarry, resolveEvent, type EventWorld, type OfferedTime, type PlanCarry, type Scenario } from '../scenarios/load.js';
import { runBareCondition, type BareSequenceState } from './bare.js';
import type { Condition, ConditionResult } from './common.js';
import { runLoopCondition } from './loop.js';
import { emptyRawSequence, recordedMail, runRawCondition, standaloneRawSequence, type RawSequenceState, type RawWrites } from './raw.js';

export interface EventRun { ev: EventWorld; result: ConditionResult }

const lower = (a: string): string => a.trim().toLowerCase();
const strs = (x: unknown): string[] => (Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string').map(lower) : []);

/** What a run did, as a carry delta (the module header lists the mapping). */
export function carryOf(r: ConditionResult, ev: EventWorld, parties: readonly string[]): Partial<PlanCarry> {
  const done = r.condition === 'A0' ? r.actions : r.actions.filter((a) => !a.refused);
  const delta: Required<Pick<PlanCarry, 'sent' | 'offered' | 'acceptances' | 'declines'>> & Pick<PlanCarry, 'amendments'> & { closed?: string } = { sent: [], offered: [], acceptances: [], declines: [] };
  // BOB'S AMENDMENTS ARE ON THE PLAN ROW for every later event (PlansStore.amend): each amend the recorder took (its would-be
  // holds the value as the tool read it), stamped with the event's now as the store stamps it.
  const amended = (r.would ?? []).filter((w) => w.tool === 'amend').map((w) => {
    const x = w.detail as { field: string; value: unknown; hard: boolean; words: string };
    return { at: ev.now, field: x.field, value: x.value, hard: x.hard, words: x.words } as PlanAmendment;
  });
  if (amended.length) delta.amendments = amended;
  const timeOf = (a: (typeof done)[number], n: number): OfferedTime | undefined => {
    const k = a.context.known.find((s) => s.id === n) ?? r.minted?.find((m) => m.id === n);
    return k ? { id: n, start: k.start, end: k.end } : undefined;
  };
  const sentAs = (what: SentState['what'], to: string[], slots: number[], status: string, summary: string): SentState => ({ what, at: ev.now, to, slots, status, summary, wentOut: true, wentOutAt: ev.now });
  const outs = new Set(ev.declines.map((d) => lower(d.party)));
  for (const a of done) {
    const d = a.decision;
    if (d.tool === 'propose') {
      const slots = (Array.isArray(d.args['slots']) ? d.args['slots'] : [d.args['slots']]).filter((n): n is number => Number.isInteger(n));
      const known = slots.flatMap((n) => { const t = timeOf(a, n); return t ? [t] : []; });
      delta.offered.push(...known);
      delta.sent.push(sentAs('proposal', strs(d.args['to']), known.map((k) => k.id), 'sent', `(bench carry) proposal from event ${ev.index + 1}, approved by Bob`));
    } else if (d.tool === 'ask') {
      delta.sent.push(sentAs('ask', strs(d.args['to']), [], 'sent', `(bench carry) ask from event ${ev.index + 1}, approved by Bob: ${String(d.args['text'] ?? d.args['template'] ?? '').slice(0, 200)}`));
    } else if (d.tool === 'record_yes' && typeof d.args['party'] === 'string' && Number.isInteger(d.args['slot'])) {
      delta.acceptances.push({ party: lower(d.args['party']), slot: d.args['slot'] as number, at: ev.now });
      const t = timeOf(a, d.args['slot'] as number); if (t) delta.offered.push(t);
    } else if (d.tool === 'record_no' && d.args['out'] === true && typeof d.args['party'] === 'string') {
      delta.declines.push({ party: lower(d.args['party']), words: String(d.args['words'] ?? ''), at: ev.now });
      outs.add(lower(d.args['party']));
      if (parties.every((p) => outs.has(lower(p)))) delta.closed = `every party is out (event ${ev.index + 1})`;
    } else if (d.tool === 'book' && Number.isInteger(d.args['slot'])) {
      const n = d.args['slot'] as number;
      const t = timeOf(a, n); if (t) delta.offered.push(t);
      delta.sent.push(sentAs('booking', strs(d.args['attendees']), [n], 'booked and confirmed', `(bench carry) booking from event ${ev.index + 1}, approved by Bob`));
      delta.closed = `booked [slot ${n}] (event ${ev.index + 1})`;
    }
  }
  return delta;
}

/**
 * A's carry: the mapped proposals, asks and bookings through carryOf, and a mapped close (done closed) as the plan's
 * close. The close's record_no names one party only to make the class; no party is marked out by it.
 */
export function rawCarryOf(r: ConditionResult, ev: EventWorld, parties: readonly string[]): Partial<PlanCarry> {
  const closes = r.actions.filter((a) => a.decision.tool === 'record_no' && a.decision.args['out'] === true);
  const delta = carryOf({ ...r, actions: r.actions.filter((a) => !closes.includes(a)) }, ev, parties);
  if (closes.length && !delta.closed) delta.closed = `closed by her (done closed, event ${ev.index + 1})`;
  return delta;
}

/** Her writes of one event appended to the sequence state, as approved. */
export function nextRawSequence(seq: RawSequenceState, w: RawWrites): RawSequenceState {
  return { mail: [...seq.mail, ...w.mail], events: [...seq.events, ...w.events], bobChat: [...seq.bobChat, ...w.bobChat] };
}

/** Whether the next event's persona messages have a proposal of hers to answer in this carry. */
function personaCanAnswer(sc: Scenario, k: number, carry: PlanCarry): boolean {
  return (sc.events[k]?.add?.thread ?? []).filter((m) => m.persona).every((m) => latestOffersTo(m.from, carry).length > 0);
}

/**
 * Run events `from..to` of a scenario in order under one condition, carrying the plan between them. A single event
 * (`from === to`) resolves standalone, from the scenario's own record of the earlier events.
 */
export async function runSequence(condition: Condition, sc: Scenario, modelFn: ModelFn, model: string, range: { from?: number; to?: number } = {}): Promise<EventRun[]> {
  const from = range.from ?? 0;
  const to = range.to ?? sc.events.length - 1;
  const out: EventRun[] = [];
  let ev = resolveEvent(sc, from);
  let minted: OfferedTime[] = [...ev.offered];
  let seq: BareSequenceState | undefined;
  let rawSeq: RawSequenceState = from > 0 ? standaloneRawSequence(sc, from) : emptyRawSequence();
  for (let k = from; k <= to; k += 1) {
    let result: ConditionResult;
    if (condition === 'A0') {
      const r = await runBareCondition(sc, ev, modelFn, model, { minted, ...(seq ? { seq } : {}) });
      seq = r.seq; result = r;
    } else if (condition === 'A') {
      const r = await runRawCondition(sc, ev, modelFn, model, { minted, seq: rawSeq });
      rawSeq = nextRawSequence(rawSeq, r.writes); result = r;
    } else {
      result = await runLoopCondition(condition, sc, ev, modelFn, model, { minted });
    }
    out.push({ ev, result });
    if (k === to) break;
    minted = result.minted ?? minted;
    const delta = condition === 'A' ? rawCarryOf(result, ev, sc.plan.parties) : carryOf(result, ev, sc.plan.parties);
    let carry: PlanCarry = mergeCarry({ sent: ev.sent, offered: ev.offered, acceptances: ev.acceptances, declines: ev.declines, openCards: ev.openCards, ...(ev.closed ? { closed: ev.closed } : {}), ...(ev.amendments ? { amendments: ev.amendments } : {}) }, delta);
    let fromWhat: 'run' | 'run+capture' = 'run';
    if (!personaCanAnswer(sc, k + 1, carry)) {
      carry = mergeCarry(carry, sc.events[k]!.capture); fromWhat = 'run+capture'; minted = [...minted, ...(sc.events[k]!.capture?.offered ?? [])];
      if (condition === 'A') rawSeq = { ...rawSeq, mail: [...rawSeq.mail, ...recordedMail(sc, sc.events[k]!.capture)] };
    }
    const thread: StateMessage[] = ev.thread; const bob: BobLine[] = ev.bob;
    ev = resolveEvent(sc, k + 1, { carry, thread, bob, from: fromWhat });
  }
  return out;
}

export { initialCarry };
