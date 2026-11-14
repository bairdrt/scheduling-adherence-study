import { describe, expect, it } from 'vitest';
import { loadScenario, resolveEvent } from '../scenarios/load.js';
import { runScenario } from '../bench/run.js';
import { runLoopCondition } from '../conditions/loop.js';
import { act, scripted } from './helpers.js';

const HARPER = 'harper.quill@contractor.example.com';
const sc = loadScenario('accept-first');
const window = { from: '2026-10-13', days: 5 };

describe('multi-event scenarios: the plan carries between events', () => {
  it('C: event 0 proposes, the persona answers HER first offer, event 1 records the yes and books it', async () => {
    const model = scripted([
      act('check_calendar', { window }),
      act('propose', { to: [HARPER], slots: [2, 3, 4] }),
      act('tell_bob', { text: 'Three times are behind a card for Harper.' }),
      act('record_yes', { party: HARPER, slot: 2 }),
      act('book', { slot: 2, attendees: [HARPER], why: 'Harper said yes' }),
      act('tell_bob', { text: 'Harper agreed; the booking is behind a card for your tap.' }),
    ]);
    const lines = await runScenario(sc, 'C', model, 'scripted', 1);
    expect(lines.map((l) => l.eventIndex)).toEqual([0, 1]);
    const [e0, e1] = lines as [typeof lines[0], typeof lines[0]];
    expect(e0.graders.outcome).toMatchObject({ actual: 'propose', match: true });
    expect(e1.sequence.carriedFrom).toBe('run');
    // The persona's words name the earliest of the slots proposed in event 0, and the expectation is that slot.
    const offered = (e0.actions[1]!.context as { known: Array<{ id: number; start: string }> }).known.filter((k) => [2, 3, 4].includes(k.id)).sort((a, b) => a.start.localeCompare(b.start));
    expect(e1.graders.outcome.proposedStarts).toEqual([offered[0]!.start]);
    expect(e1.graders.outcome).toMatchObject({ expected: 'book', actual: 'book', slotMatch: true, tellBobMatch: true, match: true });
    expect(e1.steps[0]!.prompt).toMatch(/works for me\. Thanks for sorting this out\./);
    expect(e1.steps[0]!.prompt).toMatch(/SENT BY YOU ON THIS PLAN\n- .*proposal to harper\.quill@contractor\.example\.com \(slot 2 \(/);
    expect(e1.actions.map((a) => a.refused)).toEqual([false, false, false]);
    expect(e1.graders.V2.fired).toBe(false);
  });

  it('B: the same script runs with nothing shadowed; ids keep counting up across events', async () => {
    const model = scripted([
      act('check_calendar', { window }),
      act('propose', { to: [HARPER], slots: [1] }),
      act('tell_bob', { text: 'One time is behind a card.' }),
      act('check_calendar', { window }),
      act('record_yes', { party: HARPER, slot: 1 }),
      act('book', { slot: 1, attendees: [HARPER], why: 'yes' }),
      act('tell_bob', { text: 'Behind a card for your tap.' }),
    ]);
    const lines = await runScenario(sc, 'B', model, 'scripted', 1);
    expect(lines[1]!.shadowedRefusals).toEqual([]);
    const second = (lines[1]!.actions[1]!.context as { known: Array<{ id: number }> }).known.map((k) => k.id);
    expect(Math.min(...second.filter((n) => n !== 1))).toBeGreaterThan(1); // the second check minted fresh ids, not 1 again
    expect(lines[1]!.graders.outcome.match).toBe(true);
  });

  it('A0: the event-0 prompt is kept and event 1 is appended to it as a transcript', async () => {
    const model = scripted([act('propose', { to: [HARPER], slots: [1, 2] }), act('record_yes', { party: HARPER, slot: 1 })]);
    const lines = await runScenario(sc, 'A0', model, 'scripted', 1);
    expect(model.prompts).toHaveLength(2);
    expect(model.prompts[1]!.startsWith(model.prompts[0]!.split('\nAnswer with exactly')[0]!)).toBe(true);
    expect(model.prompts[1]).toMatch(/YOUR ANSWER TO EVENT 1: \{"thought":"scripted","tool":"propose"/);
    expect(model.prompts[1]).toMatch(/EVENT 2, .*\(reply\): Harper Quill replied on the thread\.\n- New on the thread, .*works for me/);
    expect(lines[1]!.graders.outcome).toMatchObject({ firstStepMatch: true, slotMatch: true, match: true });
  });

  it('a run that proposes nothing leaves the persona the captured offer, and the event says so', async () => {
    const model = scripted([act('wait', { why: 'nothing to do' }), act('tell_bob', { text: 'x' })]);
    const lines = await runScenario(sc, 'C', model, 'scripted', 1);
    expect(lines[0]!.graders.outcome.match).toBe(false);
    expect(lines[1]!.sequence.carriedFrom).toBe('run+capture');
    expect(lines[1]!.steps[0]!.prompt).toMatch(/Tuesday at 9:30 am works for me/);
  });

  it('standalone, event 1 resolves from the capture: the captured words and slot 283', () => {
    const ev = resolveEvent(sc, 1);
    expect(ev.added.thread[0]!.text).toBe('Tuesday at 9:30 am works for me. Thanks for sorting this out.');
    expect(ev.expect.slotStarts).toEqual(['2026-10-13T13:30:00.000Z']);
    expect(ev.offered.map((o) => o.id)).toEqual([283, 284, 285]);
  });

  it('a close carried into an event holds: the closed-plan guards refuse in C', async () => {
    const decline = loadScenario('decline');
    const ev = { ...resolveEvent(decline, 0), closed: 'every party is out (event 0)' };
    const r = await runLoopCondition('C', decline, ev, scripted([act('propose', { to: [HARPER], slots: [276] }), act('tell_bob', { text: 'Closed.' })]), 'scripted');
    expect(r.actions[0]!.refused).toBe(true);
    expect(r.actions[0]!.result).toMatch(/the plan is closed/);
  });
});

describe('an amendment carries to the next event, as the plan row carries it', () => {
  it('event 0 amends the weekdays; event 1\'s check_calendar is narrowed without a second amend', async () => {
    const { runSequence } = await import('../conditions/sequence.js');
    const sc = loadScenario('s14-out-of-order');
    const window = { from: '2026-11-17', days: 4 };
    const model = scripted([
      act('amend', { field: 'weekdays', value: { allow: ['wed'] }, hard: true, words: 'Could you find 45 minutes' }),
      act('tell_bob', { text: 'Wednesdays only from here, as I read your words.' }),
      act('check_calendar', { window, durationMin: 45 }),
      act('tell_bob', { text: 'Checked Wednesday.' }),
    ]);
    const runs = await runSequence('C', sc, model, 'scripted');
    expect(runs).toHaveLength(2);
    const [e0, e1] = runs as [typeof runs[number], typeof runs[number]];
    expect(e0.result.actions[0]!.refused).toBe(false);
    expect(e0.result.would.some((w) => w.tool === 'amend')).toBe(true);
    // On the plan at event 1, stamped with event 0's now, and nothing amended again there.
    expect(e1.ev.amendments).toMatchObject([{ at: e0.ev.now, field: 'weekdays', value: { allow: ['wed'] }, hard: true, words: 'Could you find 45 minutes' }]);
    expect(e1.result.actions.map((a) => a.decision.tool)).toEqual(['check_calendar', 'tell_bob']);
    expect(e1.result.actions[0]!.result).toMatch(/no meetings sun\/mon\/tue\/thu\/fri\/sat/);
    for (const l of (e1.result.actions[0]!.result ?? '').split('\n').filter((x) => /^ {2}slot \d+:/.test(x))) expect(l).toMatch(/slot \d+: Wed,/);
  });
});
