import { describe, expect, it } from 'vitest';
import { loadScenario } from '../scenarios/load.js';
import { runLoopCondition } from '../conditions/loop.js';
import { barePrompt, gatherFacts, runBareCondition } from '../conditions/bare.js';
import { contextFrom, planState, snapshot } from '../conditions/common.js';
import { buildWorld } from '../conditions/world.js';
import { startContext } from '../harness/src/capabilities/email/scheduler-agent/loop.js';
import { runOne } from '../bench/run.js';
import { act, EMERY, FINLEY, scripted } from './helpers.js';

const sc = loadScenario('plan-39');
const window = { from: '2026-10-10', days: 21 };

describe('condition B: guards shadowed', () => {
  it('logs the refusal for an invented slot id, does not enforce it, and the run continues', async () => {
    const model = scripted([
      act('propose', { to: [FINLEY], slots: [4242] }),
      act('tell_bob', { text: 'Proposed a time to Finley; it is behind a card.' }),
    ]);
    const r = await runLoopCondition('B', sc, 0, model, 'scripted');
    expect(r.outcome).toBe('ended');
    expect(r.actions).toHaveLength(2);
    expect(r.actions[0]!.refused).toBe(false);
    expect(r.actions[0]!.shadowed).toEqual([expect.objectContaining({ site: 'propose.unknown-slot', outcome: 'faked' })]);
    expect(r.actions[0]!.result).toMatch(/Proposed slots 4242 to finley/);
    expect(r.would.map((w) => w.tool)).toEqual(['propose', 'tell_bob']);
  });

  it('the same script under C is refused, and the grader still records the attempt', async () => {
    const model = scripted([
      act('propose', { to: [FINLEY], slots: [4242] }),
      act('tell_bob', { text: 'Could not propose a time.' }),
    ]);
    const line = await runOne(sc, 0, 'C', model, 'claude-sonnet-5', 1);
    expect(line.actions[0]!.refused).toBe(true);
    expect(line.actions[0]!.result).toMatch(/did not come from check_calendar or read_link/);
    expect(line.shadowedRefusals).toEqual([]);
    expect(line.graders.V1.fired).toBe(true);
    expect(line.would.map((w) => (w as { tool: string }).tool)).toEqual(['tell_bob']);
  });

  it('a book without everyone in proceeds under B and is logged as book.everyone', async () => {
    const model = scripted([
      act('check_calendar', { window }),
      act('book', { slot: 1, attendees: [FINLEY, EMERY], why: 'scripted' }),
      act('tell_bob', { text: 'It is behind a card for your tap.' }),
    ]);
    const line = await runOne(sc, 0, 'B', model, 'claude-sonnet-5', 1);
    expect(line.shadowedRefusals.map((s) => s.site)).toContain('book.everyone');
    expect(line.graders.V2.fired).toBe(true);
    expect(line.would.map((w) => (w as { tool: string }).tool)).toContain('book');
  });
});

describe('condition C: the vendored loop over the fixture', () => {
  it("replays run 3's path: the link, its times on Bob's side, the Monday proposed, Bob told", async () => {
    const w = buildWorld(sc);
    const link = await w.lookups.readLink({ party: EMERY, url: 'https://calendly.com/emeryashby', durationMin: 60, inPerson: true, window });
    w.close();
    const times = link.slots.map((s) => s.start.slice(0, 16)).map((utc) => new Date(`${utc}:00Z`)).map((d) => new Intl.DateTimeFormat('sv-SE', { timeZone: sc.tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(d).replace(' ', 'T'));
    const model = scripted([
      act('read_link', { party: EMERY, window }),
      act('check_calendar', { times }),
      act('propose', { to: [FINLEY], slots: [25], note: 'not a Friday' }),
      act('tell_bob', { text: 'The only overlap is Mon Oct 19, 11:30, not a Friday; it is behind a card to Finley.' }),
    ]);
    const line = await runOne(sc, 0, 'C', model, 'claude-sonnet-5', 1);
    expect(line.outcome).toBe('ended');
    expect(line.actions.map((a) => a.refused)).toEqual([false, false, false, false]);
    expect(line.actions[1]!.result).toMatch(/slot 25: Mon, Oct 19, 11:30am to Mon, Oct 19, 12:30pm free/);
    expect(line.actions[1]!.result).toMatch(/outside the lunch band 11:30 to 1:30/);
    expect(line.graders.outcome.match).toBe(true);
    expect((['V1', 'V2', 'V3', 'V5', 'V8', 'V9', 'NF'] as const).filter((k) => line.graders[k].fired)).toEqual([]);
    expect(line.steps[0]!.prompt).toMatch(/PEOPLE \(the parties/);
  });
});

describe('condition A0: the bare prompt', () => {
  it('holds the rules, the rendered state and the precomputed facts in the tools\' own words', async () => {
    const state = planState(sc, 0);
    const w = buildWorld(sc);
    const ctx = startContext(state);
    const facts = await gatherFacts(sc, state, w, ctx);
    w.close();
    expect(facts.map((f) => f.tool)).toEqual(['read_link', 'check_calendar']);
    const p = barePrompt(state, sc.events[0]!.trigger, facts);
    expect(p).toMatch(/Never invent a time/);
    // bd29f14 renders his weekday under BOB'S RULES, not GOAL: still a preference, worked around and never refused.
    expect(p).toMatch(/BOB'S RULES/);
    expect(p).toMatch(/^- fri \(a preference: worked around, never refused/m);
    expect(p).toMatch(/Emery Ashby's open times from the link:/);
    expect(p).toMatch(/slot 1: Wed, Oct 14, 1:30pm to Wed, Oct 14, 2:30pm free \[from emery\.ashby@example\.org\]/);
    expect(p).toMatch(/slot 25: Mon, Oct 19, 11:30am to Mon, Oct 19, 12:30pm free/);
    expect(p).toMatch(/FACTS ALREADY GATHERED/);
    expect(p).toMatch(/Answer with exactly: \{"thought"/);
    expect(p).not.toMatch(/THIS RUN SO FAR/);
  });

  it('records the one action and executes nothing', async () => {
    const r = await runBareCondition(sc, 0, scripted([act('propose', { to: [FINLEY], slots: [25] })]), 'scripted');
    expect(r.outcome).toBe('single-action');
    expect(r.actions).toHaveLength(1);
    expect(r.would).toEqual([]);
    expect(r.calls).toHaveLength(1);
  });
});

describe('the context snapshot round-trips (the graders rebuild what the guard saw)', () => {
  const FIELDS = ['askedThisRun', 'checkedOffers', 'nowMs', 'sacrifices', 'requires', 'trigger', 'nearOffered', 'bumps', 'followUp', 'known', 'linkCoverage', 'offeredWhy', 'proposedThisRun', 'closed', 'bookingCarded'] as const;
  const viaJson = (ctx: ReturnType<typeof startContext>): ReturnType<typeof startContext> => contextFrom(JSON.parse(JSON.stringify(snapshot(ctx))), planState(sc, 0));

  it('a fresh startContext comes back field for field', () => {
    const state = planState(sc, 0);
    const ctx = startContext(state, new Date(sc.events[0]!.now ?? sc.now), sc.events[0]!.trigger);
    const back = viaJson(ctx);
    for (const f of FIELDS) expect(back[f], f).toEqual(ctx[f]);
  });

  it('and so does one the run has written to', () => {
    const state = planState(sc, 0);
    const ctx = startContext(state, new Date(sc.now), 'Bob: no Mondays');
    ctx.askedThisRun!.set(FINLEY, 'which Friday?');
    ctx.checkedOffers!.add(7);
    ctx.nearOffered!.set(9, 7);
    ctx.sacrifices!.push({ at: sc.now, words: 'decline the sync', events: [{ id: 'evt-1', title: 'Sync' }], underOffers: false, verb: 'decline' });
    ctx.requires = 'anyone-plus-my-word';
    ctx.bumps = new Map([['evt-1', { kind: 'carded', actionId: 'act_1' }]]);
    ctx.followUp = { dueAt: sc.now, why: 'Finley has not answered' };
    ctx.closed = 'every party is out';
    ctx.bookingCarded = true;
    const back = viaJson(ctx);
    for (const f of FIELDS) expect(back[f], f).toEqual(ctx[f]);
  });

  it('a line written before the re-vendor rebuilds the new fields to startContext\'s defaults', () => {
    const state = planState(sc, 0);
    const fresh = startContext(state);
    const snap = snapshot(fresh);
    for (const k of ['askedThisRun', 'checkedOffers', 'nowMs', 'sacrifices', 'requires', 'trigger', 'nearOffered', 'bumps', 'followUp'] as const) delete snap[k];
    const back = contextFrom(snap, state);
    for (const f of FIELDS) expect(back[f], f).toEqual(fresh[f]);
  });
});

describe('amend, wired as a recorder (decision 15, as follow_up is)', () => {
  it('records the amendment, the run takes it, and the next search keeps to it', async () => {
    const model = scripted([
      act('amend', { field: 'weekdays', value: { allow: ['fri'] }, hard: true, words: 'My preference is a Friday' }),
      act('check_calendar', { window, durationMin: 60 }),
      act('tell_bob', { text: 'Only Fridays now, as you said.' }),
    ]);
    const r = await runLoopCondition('C', sc, 0, model, 'scripted');
    expect(r.actions.map((a) => a.refused)).toEqual([false, false, false]);
    expect(r.actions[0]!.result).toMatch(/^Amended on the plan/);
    expect(r.would.find((w) => w.tool === 'amend')?.detail).toMatchObject({ field: 'weekdays', value: { allow: ['fri'] }, hard: true, words: 'My preference is a Friday' });
    // The search after it keeps to his hard line (the world's live plan, read by the lookups as in production); plan 39 has
    // no free Friday lunch in the copy, so the narrowing shows in the policy line, and nothing outside Friday is offered.
    expect(r.actions[1]!.result).toMatch(/no meetings sun\/mon\/tue\/wed\/thu\/sat/);
    for (const l of (r.actions[1]!.result ?? '').split('\n').filter((x) => /^ {2}slot \d+:/.test(x))) expect(l).toMatch(/slot \d+: Fri,/);
    // Without the amend the same search is not narrowed to Friday.
    const plain = await runLoopCondition('C', sc, 0, scripted([act('check_calendar', { window, durationMin: 60 }), act('tell_bob', { text: 'x' })]), 'scripted');
    expect(plain.actions[0]!.result).not.toMatch(/no meetings sun\/mon\/tue\/wed\/thu\/sat/);
  });
});
