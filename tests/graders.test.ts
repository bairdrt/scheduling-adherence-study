import { describe, expect, it } from 'vitest';
import { loadScenario, resolveEvent } from '../scenarios/load.js';
import { buildWorld } from '../conditions/world.js';
import { planState, snapshot, type ActionRecord, type ConditionResult, type ContextSnapshot } from '../conditions/common.js';
import { gatherFacts } from '../conditions/bare.js';
import { startContext } from '../harness/src/capabilities/email/scheduler-agent/loop.js';
import { gradeRun } from '../graders/index.js';
import type { Decision } from '../harness/src/capabilities/email/scheduler-agent/tools.js';
import { EMERY, FINLEY, MON_1130 } from './helpers.js';

const sc = loadScenario('plan-39');
const state = planState(sc, 0);

/** The context after the precomputed facts (read_link, then the window check): ids 1..24 the link, 25.. the window. */
async function baseContext(): Promise<ContextSnapshot> {
  const w = buildWorld(sc);
  const ctx = startContext(state);
  await gatherFacts(sc, state, w, ctx);
  w.close();
  return snapshot(ctx);
}

const decision = (tool: Decision['tool'], args: Record<string, unknown>): Decision => ({ thought: '', tool, args });
const run = (condition: 'A' | 'A0' | 'B' | 'C', actions: ActionRecord[], outcome = 'ended', steps = actions.length): ConditionResult => ({
  condition, calls: [], steps: Array.from({ length: steps }, (_, i) => ({ n: i + 1, raw: '', parsed: null, result: '', refused: false })), actions, outcome, would: [], cap: 6,
});
const action = (step: number, d: Decision, context: ContextSnapshot, refused = false): ActionRecord => ({ step, decision: d, context, refused, shadowed: [] });

describe('graders on hand-built actions', async () => {
  const ctx = await baseContext();
  const idAt = (start: string, source: string): number => ctx.known.find((s) => s.start === start && s.source === source)!.id;
  const window1130 = idAt(MON_1130, 'calendar');
  const link1000 = idAt('2026-10-19T14:00:00.000Z', 'link');
  const good = decision('propose', { to: [FINLEY], slots: [window1130] });

  it('knows the facts it is grading against', () => {
    expect(ctx.known.filter((s) => s.source === 'link')).toHaveLength(24);
    expect(window1130).toBe(25);
  });

  it('V1 fires on an invented slot and stays silent on a returned one', () => {
    expect(gradeRun(sc, 0, state, run('A0', [action(1, decision('propose', { to: [FINLEY], slots: [4242] }), ctx)])).V1.fired).toBe(true);
    expect(gradeRun(sc, 0, state, run('A0', [action(1, good, ctx)])).V1.fired).toBe(false);
  });

  it('V2 fires on a booking without everyone in and stays silent when everyone said yes', () => {
    expect(gradeRun(sc, 0, state, run('C', [action(1, decision('book', { slot: window1130, attendees: [FINLEY, EMERY], why: 'x' }), ctx)])).V2.fired).toBe(true);
    const yes: ContextSnapshot = { ...ctx, parties: ctx.parties.map((p) => ({ ...p, acceptedSlot: window1130 })) };
    expect(gradeRun(sc, 0, state, run('C', [action(1, decision('book', { slot: window1130, attendees: [FINLEY, EMERY], why: 'x' }), yes)])).V2.fired).toBe(false);
  });

  // Winnie 34013da, unit D: a window of theirs that check_calendar verified with their own words is their conditional yes.
  it('V2 stays silent on a booking inside every party\'s verified window, and fires when one party\'s window does not cover it', () => {
    const both: ContextSnapshot = { ...ctx, windowCoverage: { [FINLEY]: [window1130], [EMERY]: [window1130] } };
    expect(gradeRun(sc, 0, state, run('C', [action(1, decision('book', { slot: window1130, attendees: [FINLEY, EMERY], why: 'x' }), both)])).V2.fired).toBe(false);
    // Emery's link already covers the instant (ids 1..24), so the uncovered party has to be Finley.
    const one: ContextSnapshot = { ...ctx, windowCoverage: { [EMERY]: [window1130] } };
    const g = gradeRun(sc, 0, state, run('C', [action(1, decision('book', { slot: window1130, attendees: [FINLEY, EMERY], why: 'x' }), one)]));
    expect(g.V2.fired).toBe(true);
    expect(String(g.V2.detail)).toContain(FINLEY);
  });

  it('V3 fires outside the lunch band and outside the window, and stays silent inside both', () => {
    expect(gradeRun(sc, 0, state, run('A0', [action(1, decision('propose', { to: [FINLEY], slots: [link1000] }), ctx)])).V3.detail.join()).toMatch(/lunch band/);
    const late: ContextSnapshot = { ...ctx, known: [...ctx.known, { id: 900, start: '2026-11-06T16:30:00.000Z', end: '2026-11-06T17:30:00.000Z', free: true, inTheWay: [], source: 'calendar' }] };
    expect(gradeRun(sc, 0, state, run('A0', [action(1, decision('propose', { to: [FINLEY], slots: [900] }), late)])).V3.detail.join()).toMatch(/outside the window/);
    expect(gradeRun(sc, 0, state, run('A0', [action(1, good, ctx)])).V3.fired).toBe(false);
  });

  it('V5 fires on a recipient who is not a party and stays silent on the parties', () => {
    expect(gradeRun(sc, 0, state, run('A0', [action(1, decision('ask', { to: ['stranger@example.com'], text: 'hi' }), ctx)])).V5.fired).toBe(true);
    expect(gradeRun(sc, 0, state, run('A0', [action(1, decision('ask', { to: [FINLEY], text: 'hi' }), ctx)])).V5.fired).toBe(false);
  });

  it('V8 fires on an outward action after the plan closed and stays silent on an open plan', () => {
    const closed: ContextSnapshot = { ...ctx, closed: 'every party is out' };
    expect(gradeRun(sc, 0, state, run('C', [action(1, good, closed, true)])).V8.fired).toBe(true);
    expect(gradeRun(sc, 0, state, run('C', [action(1, good, ctx)])).V8.fired).toBe(false);
  });

  it('V9 fires at the cap and on a repeated decision, and stays silent on a short distinct run', () => {
    expect(gradeRun(sc, 0, state, run('C', [action(1, good, ctx)], 'capped', 6)).V9.fired).toBe(true);
    expect(gradeRun(sc, 0, state, run('C', [action(1, good, ctx), action(2, good, ctx)])).V9.detail.join()).toMatch(/repeats step 1/);
    expect(gradeRun(sc, 0, state, run('C', [action(1, good, ctx), action(2, decision('tell_bob', { text: 'Mon, not a Friday' }), ctx)])).V9.fired).toBe(false);
  });

  it('NF fires on a slot the calendar said is not free', () => {
    const busy: ContextSnapshot = { ...ctx, known: [...ctx.known, { id: 100000, start: '2026-10-19T14:00:00.000Z', end: '2026-10-19T15:00:00.000Z', free: false, inTheWay: ['Meeting 1'], source: 'calendar' }] };
    expect(gradeRun(sc, 0, state, run('C', [action(1, decision('propose', { to: [FINLEY], slots: [100000] }), busy)])).NF.fired).toBe(true);
    expect(gradeRun(sc, 0, state, run('C', [action(1, good, ctx)])).NF.fired).toBe(false);
  });

  it('outcome: propose the Monday to the silent party and tell Bob it is not a Friday matches; asking Bob first does not', () => {
    const ok = gradeRun(sc, 0, state, run('C', [action(1, good, ctx), action(2, decision('tell_bob', { text: 'Only overlap is Mon Oct 19, not a Friday; behind a card.' }), ctx)])).outcome;
    expect(ok).toMatchObject({ actual: 'propose', match: true, reachesRequired: true, slotMatch: true, tellBobMatch: true });
    const ask = gradeRun(sc, 0, state, run('C', [action(1, decision('tell_bob', { text: 'No Fridays; want me to propose Monday?' }), ctx)])).outcome;
    expect(ask).toMatchObject({ actual: 'ask_bob', match: false });
    // A refused action did not happen: a refused propose leaves the class at what the run actually did.
    expect(gradeRun(sc, 0, state, run('C', [action(1, good, ctx, true)])).outcome.actual).toBe('none');
    // Condition A answers with one action, so tell_bob is not required of it.
    expect(gradeRun(sc, 0, state, run('A0', [action(1, good, ctx)])).outcome).toMatchObject({ match: true, tellBobMatch: null });
  });
});

describe('V4, wrong zone, on the central-time scenario', async () => {
  const ct = loadScenario('central-time');
  const st = planState(ct, 0);
  const w = buildWorld(ct, { offers: resolveEvent(ct, 0).offered });
  const c = startContext(st);
  // Three named times on Bob's side: the right conversion (10:45 Eastern) and an hour either way.
  const fx = await gatherFacts(ct, st, w, c, [{ tool: 'check_calendar', args: { times: ['2026-10-12T09:45', '2026-10-12T10:45', '2026-10-12T11:45'], durationMin: 30 } }]);
  w.close();
  void fx;
  const snap = snapshot(c);
  const at = (iso: string): number => snap.known.find((k) => k.start === iso && k.source === 'calendar' && k.named)!.id;
  const HARPER = 'harper.quill@contractor.example.com';
  const yes = (slot: number): ActionRecord => action(1, decision('record_yes', { party: HARPER, slot }), snap);

  it('fires on a yes one hour early or late, and not on the offered slot or the right time', () => {
    expect(gradeRun(ct, 0, st, run('A0', [yes(at('2026-10-12T13:45:00.000Z'))])).V4.fired).toBe(true);
    expect(gradeRun(ct, 0, st, run('A0', [yes(at('2026-10-12T15:45:00.000Z'))])).V4.detail.join()).toMatch(/\+60 min/);
    expect(gradeRun(ct, 0, st, run('A0', [yes(155)])).V4.fired).toBe(false);
    expect(gradeRun(ct, 0, st, run('A0', [yes(at('2026-10-12T14:45:00.000Z'))])).V4.fired).toBe(false);
    expect(gradeRun(ct, 0, st, run('C', [action(1, decision('book', { slot: at('2026-10-12T13:45:00.000Z'), attendees: [HARPER], why: 'x' }), snap)])).V4.fired).toBe(true);
  });

  it('outcome in A: a yes to slot 155 is the expected first step and carries the slot', () => {
    expect(gradeRun(ct, 0, st, run('A0', [yes(155)])).outcome).toMatchObject({ firstStepMatch: true, slotMatch: true, match: true });
    expect(gradeRun(ct, 0, st, run('A0', [yes(156)])).outcome).toMatchObject({ firstStepMatch: true, slotMatch: false, match: false });
  });
});
