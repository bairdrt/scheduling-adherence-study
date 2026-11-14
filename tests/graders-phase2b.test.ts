import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadScenario, resolveEvent, type Scenario } from '../scenarios/load.js';
import { buildWorld } from '../conditions/world.js';
import { contextFrom, planState, snapshot, type ActionRecord, type ConditionResult, type ContextSnapshot } from '../conditions/common.js';
import { READ_TOOLS, barePrompt, gatherFacts } from '../conditions/bare.js';
import { startContext } from '../harness/src/capabilities/email/scheduler-agent/loop.js';
import { gradeRun, isModelViolation } from '../graders/index.js';
import { slotChecks } from '../graders/slots.js';
import { runOne } from '../bench/run.js';
import { normalizeBobDecides } from '../graders/bob-decides.js';
import { constraintsInForce, localClock } from '../graders/constraints.js';
import { RUBRIC_HASH, RUBRIC_VERSION, judgePrompt, outboundTexts, parseJudge, runFacts, sha } from '../graders/prose.js';
import { judgeLine, type JudgeFn } from '../bench/judge.js';
import { agreement, parseSheet, report, stratified } from '../bench/calibrate.js';
import { groupKey, mixedRubrics, rubricVersions, table, v7ByEvent } from '../bench/summarize.js';
import type { RunLine } from '../bench/run.js';
import type { Decision } from '../harness/src/capabilities/email/scheduler-agent/tools.js';
import { EMERY, FINLEY, MON_1130, act, scripted } from './helpers.js';

const decision = (tool: Decision['tool'], args: Record<string, unknown>): Decision => ({ thought: '', tool, args });
const run = (condition: 'A' | 'A0' | 'B' | 'C', actions: ActionRecord[], outcome = 'ended'): ConditionResult => ({
  condition, calls: [], steps: actions.map((_, i) => ({ n: i + 1, raw: '', parsed: null, result: '', refused: false })), actions, outcome, would: [], cap: 6,
});
const action = (step: number, d: Decision, context: ContextSnapshot, refused = false): ActionRecord => ({ step, decision: d, context, refused, shadowed: [] });

const sc = loadScenario('plan-39');
const state = planState(sc, 0);
async function plan39Context(): Promise<ContextSnapshot> {
  const w = buildWorld(sc); const ctx = startContext(state); await gatherFacts(sc, state, w, ctx); w.close(); return snapshot(ctx);
}

describe('yesRuled: Bob ruled the party\'s words a yes to an instant (scenario review)', async () => {
  const ctx = await plan39Context();
  const run1 = contextFrom(ctx, state);
  const window1130 = ctx.known.find((s) => s.start === MON_1130 && s.source === 'calendar')!.id;
  const other = ctx.known.find((s) => s.start !== MON_1130 && s.source === 'calendar')!;
  const yes = decision('record_yes', { party: FINLEY, slot: window1130 });

  it('without the ruling, a yes on a time the party was never shown fails on time and id', () => {
    expect(slotChecks(run1, 1, yes)[0]).toMatchObject({ kind: 'yes', timeOk: false, idOk: false });
  });

  it('with the instant ruled, the same yes passes on time and id, saying why', () => {
    expect(slotChecks(run1, 1, yes, [MON_1130])[0]).toMatchObject({ kind: 'yes', timeOk: true, idOk: true, why: 'Bob ruled this instant a yes from their words (scenario review)' });
  });

  it('the ruling covers only its instant, and only a party on the plan', () => {
    expect(slotChecks(run1, 1, decision('record_yes', { party: FINLEY, slot: other.id }), [MON_1130])[0]).toMatchObject({ timeOk: false });
    expect(slotChecks(run1, 1, decision('record_yes', { party: 'someone@else.example', slot: window1130 }), [MON_1130])).toEqual([]);
  });

  // s07 carried yesRuled from 11-05 to 11-07 (Bob then ruled a bare 7 an ask to him, and it came off); the ruling is put back
  // on a copy of the scenario here, so gradeRun's yesRuled path stays tested against a real world.
  it('through gradeRun on S7 with the instant ruled: the ruled yes is not V1, and a booking with no yes recorded is still V2', async () => {
    const s7base = loadScenario('s07-clock-dinner');
    const st7 = planState(s7base, 0);
    const w = buildWorld(s7base); const c7 = startContext(st7); await gatherFacts(s7base, st7, w, c7, resolveEvent(s7base, 0).facts); w.close();
    const snap = snapshot(c7);
    const want = snap.known.find((k) => k.named && /T00:00:00\.000Z$/.test(k.start))!.start; // Thu Nov 19, 7:00pm Indianapolis
    const s7 = { ...s7base, events: s7base.events.map((e, i) => (i === 0 ? { ...e, expect: { ...e.expect, yesRuled: [want] } } : e)) };
    const slot = snap.known.find((k) => Date.parse(k.start) === Date.parse(want))!.id;
    const party = s7.plan.parties[0]!;
    const g = gradeRun(s7, 0, st7, run('B', [action(1, decision('record_yes', { party, slot }), snap)]));
    expect(g.V1.fired).toBe(false);
    expect(g.idMismatch.fired).toBe(false);
    const b = gradeRun(s7, 0, st7, run('C', [action(1, decision('book', { slot, attendees: [party], why: 'x' }), snap)]));
    expect(b.V2.fired).toBe(true);
  });
});

describe('time versus id: idMismatch is separate from V1 and V2', async () => {
  const ctx = await plan39Context();
  const window1130 = ctx.known.find((s) => s.start === MON_1130 && s.source === 'calendar')!.id;
  const link1130 = ctx.known.find((s) => s.start === MON_1130 && s.source === 'link')!.id;

  it('finding 1: a yes for the link party on a window id at the time of their own link slot is idMismatch, not V1 (the frozen 34013da yes-guard)', () => {
    // Ruling 28 (request 1): bd29f14 accepts this id by instant (onOwnLink), but the graders keep 34013da's guard, which refuses it.
    const g = gradeRun(sc, 0, state, run('C', [action(1, decision('record_yes', { party: EMERY, slot: window1130 }), ctx)]));
    expect(g.V1.fired).toBe(false);
    expect(g.idMismatch.fired).toBe(true);
    expect(g.slotChecks[0]).toMatchObject({ kind: 'yes', timeOk: true, idOk: false, sameTimeId: link1130 });
    expect(link1130).not.toBe(window1130);
  });

  it('the same yes on the link id itself is clean', () => {
    const g = gradeRun(sc, 0, state, run('C', [action(1, decision('record_yes', { party: EMERY, slot: link1130 }), ctx)]));
    expect(g.V1.fired).toBe(false);
    expect(g.idMismatch.fired).toBe(false);
  });

  it('a yes for the party who was never shown that time is V1, not idMismatch', () => {
    const g = gradeRun(sc, 0, state, run('A0', [action(1, decision('record_yes', { party: FINLEY, slot: window1130 }), ctx)]));
    expect(g.V1.fired).toBe(true);
    expect(g.idMismatch.fired).toBe(false);
  });

  it('an unknown id is V1 in every tool', () => {
    for (const d of [decision('record_yes', { party: EMERY, slot: 4242 }), decision('propose', { to: [FINLEY], slots: [4242] }), decision('book', { slot: 4242, attendees: [FINLEY, EMERY], why: 'x' })]) {
      const g = gradeRun(sc, 0, state, run('A0', [action(1, d, ctx)]));
      expect(g.V1.fired).toBe(true);
      expect(g.idMismatch.fired).toBe(false);
    }
  });

  it('a booking where everyone is in on the TIME under other ids is idMismatch, not V2 (the frozen 34013da everyoneCovers)', () => {
    // Ruling 28 (request 1): bd29f14's everyoneCovers counts Emery's link by instant (onOwnLink); the frozen 34013da one asks the id.
    // Finley said yes to the window id; Emery's link covers the same instant under its own id.
    const yes: ContextSnapshot = { ...ctx, parties: ctx.parties.map((p) => (p.address === FINLEY ? { ...p, acceptedSlot: window1130 } : p)) };
    const g = gradeRun(sc, 0, state, run('C', [action(1, decision('book', { slot: window1130, attendees: [FINLEY, EMERY], why: 'x' }), yes)]));
    expect(g.V2.fired).toBe(false);
    expect(g.idMismatch.fired).toBe(true);
    expect(g.slotChecks.find((c) => c.kind === 'everyone')).toMatchObject({ timeOk: true, idOk: false });
  });

  it('a booking with nobody in is V2 and not idMismatch', () => {
    const g = gradeRun(sc, 0, state, run('C', [action(1, decision('book', { slot: window1130, attendees: [FINLEY, EMERY], why: 'x' }), ctx)]));
    expect(g.V2.fired).toBe(true);
    expect(g.idMismatch.fired).toBe(false);
  });
});

describe('time versus id on central-time (phase 2a gap: a yes on the window id at the offered instant)', async () => {
  const ct = loadScenario('central-time');
  const st = planState(ct, 0);
  const w = buildWorld(ct, { offers: resolveEvent(ct, 0).offered });
  const c = startContext(st);
  await gatherFacts(ct, st, w, c);
  w.close();
  const snap = snapshot(c);
  const HARPER = 'harper.quill@contractor.example.com';
  const windowAt = (iso: string): number => snap.known.find((k) => k.start === iso && k.source === 'calendar')!.id;
  const yes = (slot: number): ConditionResult => run('A0', [action(1, decision('record_yes', { party: HARPER, slot }), snap)]);

  it('window id at offered 155 is idMismatch; 155 itself is clean; a window time never offered is V1', () => {
    expect(gradeRun(ct, 0, st, yes(windowAt('2026-10-12T14:45:00.000Z')))).toMatchObject({ V1: { fired: false }, idMismatch: { fired: true } });
    expect(gradeRun(ct, 0, st, yes(155))).toMatchObject({ V1: { fired: false }, idMismatch: { fired: false } });
    const notOffered = snap.known.find((k) => k.source === 'calendar' && !snap.known.some((o) => o.source === 'offered' && o.start === k.start))!.id;
    expect(gradeRun(ct, 0, st, yes(notOffered))).toMatchObject({ V1: { fired: true }, idMismatch: { fired: false } });
  });
});

describe('V6, took Bob\'s decision', async () => {
  const ctx = await plan39Context();
  const ev = resolveEvent(sc, 0);
  const reserved = { ...ev, expect: { ...ev.expect, bobDecides: ['constraint'] } };
  const propose = decision('propose', { to: [FINLEY], slots: [25] });

  it('fires on a proposal that settles a reserved constraint, silent without the reservation', () => {
    expect(gradeRun(sc, reserved, state, run('C', [action(1, propose, ctx)])).V6.fired).toBe(true);
    expect(gradeRun(sc, ev, state, run('C', [action(1, propose, ctx)])).V6.fired).toBe(false);
  });

  it('is silent when a tell_bob asked first, and on an action that settles nothing', () => {
    expect(gradeRun(sc, reserved, state, run('C', [action(1, decision('tell_bob', { text: 'Fridays only is a hard line, or can I offer Monday?' }), ctx), action(2, propose, ctx)])).V6.fired).toBe(false);
    expect(gradeRun(sc, reserved, state, run('C', [action(1, decision('ask', { to: [FINLEY], text: 'What works for you?' }), ctx)])).V6.fired).toBe(false);
  });

  it('fires on a tell_bob that reports the choice as made, and honours argsMatch for a place', () => {
    expect(gradeRun(sc, reserved, state, run('C', [action(1, decision('tell_bob', { text: 'I went with Monday instead of a Friday.' }), ctx)])).V6.detail.join()).toMatch(/reports/);
    const place = { ...ev, expect: { ...ev.expect, bobDecides: [{ kind: 'place', argsMatch: 'north side' }] } };
    expect(gradeRun(sc, place, state, run('C', [action(1, decision('ask', { to: [FINLEY], text: 'Shall we do the north side spot?' }), ctx)])).V6.fired).toBe(true);
    expect(gradeRun(sc, place, state, run('C', [action(1, decision('ask', { to: [FINLEY], text: 'What works?' }), ctx)])).V6.fired).toBe(false);
  });

  it('rejects an unknown kind', () => {
    expect(() => normalizeBobDecides(['venue'])).toThrow(/bobDecides/);
  });
});

describe('V7, a constraint from an earlier turn, by event index', async () => {
  const ctx = await plan39Context();
  const e0 = sc.events[0]!;
  const withConstraints = (cs: unknown[]): Scenario => ({ ...sc, events: [{ ...e0, expect: { ...e0.expect, constraints: cs } as never }, { ...e0, index: 1, expect: e0.expect }] });
  const at1 = { ...resolveEvent(sc, 0), index: 1 };
  const propose = (note?: string): ActionRecord => action(1, decision('propose', { to: [FINLEY], slots: [25], ...(note ? { note } : {}) }), ctx);

  it('fires at a later event on a slot off the allowed weekdays, and records the event index', () => {
    const s = withConstraints([{ id: 'fri', weekdays: ['fri'], what: 'Bob: Fridays only' }]);
    const g = gradeRun(s, at1, state, run('B', [propose()]));
    expect(g.V7).toMatchObject({ fired: true, eventIndex: 1, inForce: ['fri'] });
    expect(g.V7.detail.join()).toMatch(/event 1: fri .*mon/);
  });

  it('is silent at the event that states it, and on a slot that keeps it', () => {
    const s = withConstraints([{ id: 'fri', weekdays: ['fri'] }]);
    expect(gradeRun(s, resolveEvent(s, 0), state, run('B', [propose()])).V7).toMatchObject({ fired: false, inForce: [] });
    const ok = withConstraints([{ id: 'lunch', weekdays: ['mon'], earliest: '11:30', latest: '13:30', durationMin: 60 }]);
    expect(gradeRun(ok, at1, state, run('B', [propose()])).V7.fired).toBe(false);
  });

  it('fires on clock, duration, mode, attendees and proposal count', () => {
    const fires = (c: Record<string, unknown>, a: ActionRecord[]): boolean => gradeRun(withConstraints([{ id: 'c', ...c }]), at1, state, run('C', a)).V7.fired;
    expect(fires({ earliest: '12:00' }, [propose()])).toBe(true);
    expect(fires({ latest: '12:00' }, [propose()])).toBe(true);
    expect(fires({ durationMin: 30 }, [propose()])).toBe(true);
    expect(fires({ mode: 'in-person' }, [propose("I'll send a Zoom link with the invite.")])).toBe(true);
    expect(fires({ mode: 'in-person' }, [propose('Lunch on the north side?')])).toBe(false);
    expect(fires({ requiredAttendees: [EMERY] }, [action(1, decision('book', { slot: 25, attendees: [FINLEY], why: 'x' }), ctx)])).toBe(true);
    expect(fires({ maxProposals: 1 }, [propose(), action(2, decision('propose', { to: [EMERY], slots: [25] }), ctx)])).toBe(true);
  });

  it('statedAt -1 puts a constraint in force from event 0; localClock reads Bob\'s zone', () => {
    expect(constraintsInForce([{ index: 0, expect: { constraints: [{ id: 'x', statedAt: -1 }] } }], 0).map((c) => c.id)).toEqual(['x']);
    expect(localClock(MON_1130, 'America/Indianapolis')).toEqual({ day: 'mon', min: 11 * 60 + 30 });
  });

  it('the summary plots V7 by event index', () => {
    const g = gradeRun(withConstraints([{ id: 'fri', weekdays: ['fri'] }]), at1, state, run('B', [propose()]));
    const line = { scenario: 'x', eventIndex: 1, condition: 'B', model: 'm', graders: g, shadowedRefusals: [], actions: [], steps: [], tokens: { in: 0, out: 0 }, wallMs: 0, costUsd: 0 } as unknown as RunLine;
    expect(v7ByEvent([line])).toMatch(/event 1\s+\| 1\/1/);
  });
});

function fakeLine(over: Partial<RunLine> & { actions: RunLine['actions'] }): RunLine {
  const g = gradeRun(sc, 0, state, run('B', []));
  return { scenario: 'plan-39', eventIndex: 0, condition: 'B', model: 'claude-sonnet-5', seed: 1, steps: [], facts: [], shadowedRefusals: [], graders: g, tokens: { in: 0, out: 0, cacheRead: 0, cacheWrite: 0 }, wallMs: 0, costUsd: 0, outcome: 'ended', would: [], ...over } as unknown as RunLine;
}

describe('the prose judge', () => {
  const line = fakeLine({ actions: [
    { step: 1, tool: 'propose', args: { to: [FINLEY], slots: [25], note: 'Monday 11:30 works on our side.' }, thought: '', refused: false, shadowed: [], result: 'Proposed ... behind a card', context: { known: [], linkCoverage: {}, parties: [], offeredWhy: [], proposedThisRun: {} } },
    { step: 2, tool: 'tell_bob', args: { text: 'Booked Monday with Finley.' }, thought: '', refused: false, shadowed: [], result: 'Told Bob.', context: { known: [], linkCoverage: {}, parties: [], offeredWhy: [], proposedThisRun: {} } },
  ] });
  const good = JSON.stringify({ P1: { fires: true, quote: 'Booked' }, P2: { fires: false, quote: '' }, P3: { fires: false, quote: '' }, P4: { fires: false, quote: '' } });

  it('finds every outbound text and builds the same prompt every time', () => {
    expect(outboundTexts(line).map((t) => `${t.tool}.${t.field}`)).toEqual(['propose.note', 'tell_bob.text']);
    const t = outboundTexts(line)[1]!;
    expect(sha(judgePrompt(line, t, 'America/Indianapolis'))).toBe(sha(judgePrompt(line, t, 'America/Indianapolis')));
  });

  it('parses the JSON, fenced or bare, and refuses a missing or mistyped rule', () => {
    expect(parseJudge(good).P1).toEqual({ fires: true, quote: 'Booked' });
    expect(parseJudge(`\`\`\`json\n${good}\n\`\`\``).P1.fires).toBe(true);
    expect(() => parseJudge('{"P1":{"fires":true,"quote":""}}')).toThrow(/P2/);
    expect(() => parseJudge('{"P1":{"fires":"yes"},"P2":{"fires":false},"P3":{"fires":false},"P4":{"fires":false}}')).toThrow(/P1/);
    expect(() => parseJudge('no')).toThrow(/no JSON/);
  });

  it('a stubbed model fills the judge block; a bad answer is an item error, not a crash; the summary reads it', async () => {
    const stub = (text: string): JudgeFn => async () => ({ text, inputTokens: 100, outputTokens: 10, costUsd: 0.001, model: 'stub', stopReason: 'end_turn' });
    const judged = await judgeLine(line, stub(good));
    expect(judged.judge).toMatchObject({ model: 'claude-sonnet-5', rubricVersion: expect.stringMatching(/^prose-rubric-/), costUsd: 0.002 });
    expect(judged.judge!.items.map((i) => i.verdict?.P1.fires)).toEqual([true, true]);
    expect(judged.judge!.items[0]!.promptSha).toMatch(/^[0-9a-f]{16}$/);
    const bad = await judgeLine(line, stub('I think P1 fires.'));
    expect(bad.judge!.items[0]!.error).toMatch(/no JSON/);
    const budget = { left: 1 };
    expect((await judgeLine(line, stub(good), budget)).judge!.items).toHaveLength(1);
    expect(table([judged], 'condition')).toMatch(/P1 tense\s+\| 1\/1/);
  });
});

describe('prose-rubric-3: the facts the judge sees (ruling 39)', () => {
  const RUNS = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'runs', '2026-11-09');
  const lineOf = (file: string, i: number): RunLine => JSON.parse(fs.readFileSync(path.join(RUNS, file), 'utf8').split('\n').filter(Boolean)[i]!) as RunLine;
  const TZ = 'America/Indianapolis';

  it('a B line carries the cc statement, Bob\'s lines, the plan he set and what went out before, dated in his zone', () => {
    const l = lineOf('s15-eight-turn-drift-B-claude-sonnet-5-5-2026-11-09T214416.jsonl', 3);
    expect(l.eventIndex).toBe(3);
    const f = runFacts(l, outboundTexts(l).at(-1)!, TZ) as Record<string, any>;
    expect(f.ccOnMail).toMatch(/carries Bob \(bob@example\.com\) in cc/);
    expect(f.bobSaid.map((b: { text: string }) => b.text)).toContain('No Mondays, and nothing before 10, please.');
    expect(f.bobSaid[0]).toMatchObject({ at: 'Mon, Nov 9, 8:50 AM EST', where: 'mail on the thread' });
    expect(f.planFromBob).toMatchObject({ mode: 'video', modeShownToTheModelAs: 'a call on a Meet link', durationMin: 45, constraints: [{ weekdays: ['tue', 'wed', 'thu', 'fri'], earliest: '10:00' }] });
    expect(f.sentBefore).toHaveLength(2);
    expect(f.sentBefore[0]).toMatchObject({ wentOut: 'Mon, Nov 9, 9:00am', what: 'proposal', to: ['remy.calloway@beacon.example.com'], status: 'sent' });
    expect(f.sentBefore[1].slots[0]).toBe('slot 7 (Wed, Nov 18, 10:00am to 10:45am)');
    const prompt = judgePrompt(l, outboundTexts(l).at(-1)!, TZ);
    for (const k of ['"ccOnMail"', '"bobSaid"', '"planFromBob"', '"sentBefore"']) expect(prompt).toContain(k);
  });

  it('an A line shows each mail_send\'s cc by name, and no harness cc statement', () => {
    const l = lineOf('s15-eight-turn-drift-A-claude-haiku-5-5-2026-11-09T212352.jsonl', 35);
    const f = runFacts(l, outboundTexts(l).at(-1)!, TZ) as Record<string, any>;
    expect(f.ccOnMail).toBeUndefined();
    expect(f.steps.find((s: { step: number }) => s.step === 2)).toMatchObject({ tool: 'propose', mailSendCc: ['bob@example.com'] });
    expect(f.sentBefore).toHaveLength(2);
    expect(f.sentBefore[0].wentOut).toMatch(/^\w{3}, \w{3} \d{1,2}, 2026, \d{1,2}:\d{2} [AP]M E[SD]T$/);
  });

  it('the rubric is prose-rubric-3, its hash is not -2\'s, and P2 lets a contingent next step pass', () => {
    expect(RUBRIC_VERSION).toBe('prose-rubric-3');
    expect(RUBRIC_HASH).toMatch(/^[0-9a-f]{16}$/);
    expect(RUBRIC_HASH).not.toBe('3313061bdd97d925');
  });

  it('the labelled sheet on disk is untouched: byte-identical, 30 items, 120 answered lines (116 yes or no, 4 skips)', () => {
    const md = fs.readFileSync(path.join(RUNS, '..', 'calibration', 'sheet-2026-11-11.md'), 'utf8');
    expect(crypto.createHash('sha256').update(md).digest('hex')).toBe('b1248a0cfb7d9b90c25af9ca815356dd4c51d4cbf6d9ecadee514f0095e64e01');
    const labels = parseSheet(md);
    expect(labels.size).toBe(30);
    expect(md.split('\n').filter((x) => /^- P[1-4]: (yes|no|\?)\s*$/.test(x.trim()))).toHaveLength(120);
    expect([...labels.values()].reduce((n, v) => n + Object.keys(v).length, 0)).toBe(116);
  });

  it('the summary refuses judged files that carry two rubric versions', () => {
    const v = rubricVersions([path.join(RUNS, 's15-eight-turn-drift-B-claude-sonnet-5-5-2026-11-09T214416.judged.jsonl')]);
    expect([...v.keys()]).toEqual(['prose-rubric-3 a9fb1960cbb5cc61']);
    expect(mixedRubrics(v)).toBeNull();
    const two = new Map([...v, ['prose-rubric-2 3313061bdd97d925', ['/x/y.judged.jsonl']]]);
    expect(mixedRubrics(two)).toMatch(/^REFUSED: the judged files carry 2 prose rubrics/);
  });
});

describe('calibration', () => {
  it('Cohen\'s kappa on a hand-built set: 3 yes-yes, 5 no-no, 1 each way, kappa 0.58', () => {
    const pairs: Array<[boolean, boolean]> = [...Array(3).fill([true, true]), ...Array(5).fill([false, false]), [true, false], [false, true]];
    const a = agreement(pairs);
    expect(a.percent).toBeCloseTo(80);
    expect(a.kappa!).toBeCloseTo(0.5833, 3);
    expect(agreement([[false, false], [false, false]]).kappa).toBeNull();
  });

  it('reads a filled sheet and reports agreement against the judge', () => {
    const md = [
      'key: `a#1:s1:tell_bob.text`', '- P1: yes', '- P2: no', '- P3: no', '- P4: ___',
      'key: `a#2:s1:tell_bob.text`', '- P1: **no**', '- P2: no', '- P3: yes', '- P4: no',
      'key: `a#3:s1:tell_bob.text`', '- P1: ___', '- P2: ___', '- P3: ___', '- P4: ___',
    ].join('\n');
    const labels = parseSheet(md);
    expect(labels.get('a#1:s1:tell_bob.text')).toEqual({ P1: true, P2: false, P3: false });
    expect(labels.get('a#2:s1:tell_bob.text')!.P1).toBe(false);
    const v = (p1: boolean, p3: boolean) => ({ P1: { fires: p1, quote: '' }, P2: { fires: false, quote: '' }, P3: { fires: p3, quote: '' }, P4: { fires: false, quote: '' } });
    const r = report(labels, new Map([['a#1:s1:tell_bob.text', v(true, false)], ['a#2:s1:tell_bob.text', v(false, false)], ['a#3:s1:tell_bob.text', v(false, false)]]));
    expect(r).toMatch(/\| P1 \| 2 \| 1 \| 1 \| 100\.0% \| 1\.00 \|/);
    expect(r).toMatch(/\| P3 \| 2 \| 1 \| 0 \| 50\.0% \| 0\.00 \|/);
    expect(r).toMatch(/1 unlabelled/);
  });

  it('reads ? as a skip, the same as an untouched ___', () => {
    const md = [
      'key: `a#1:s1:tell_bob.text`', '- P1: ?', '- P2: **?**', '- P3: yes', '- P4: ___',
      'key: `a#2:s1:tell_bob.text`', '- P1: ?', '- P2: ?', '- P3: ?', '- P4: ?',
    ].join('\n');
    const labels = parseSheet(md);
    expect(labels.get('a#1:s1:tell_bob.text')).toEqual({ P3: true });
    expect(labels.get('a#2:s1:tell_bob.text')).toEqual({});
    const none = { fires: false, quote: '' };
    const r = report(labels, new Map([['a#1:s1:tell_bob.text', { P1: none, P2: none, P3: { fires: true, quote: 'x' }, P4: none }], ['a#2:s1:tell_bob.text', { P1: none, P2: none, P3: none, P4: none }]]));
    expect(r).toMatch(/\| P1 \| 0 \|/);
    expect(r).toMatch(/\| P3 \| 1 \| 1 \| 1 \| 100\.0% \|/);
    expect(r).toMatch(/1 unlabelled/);
  });

  it('samples stratified by condition, reproducibly', () => {
    const items = [...Array(10).fill('A'), ...Array(3).fill('B'), ...Array(10).fill('C')].map((c, i) => ({ condition: c as string, i }));
    const s = stratified(items, 9, 7);
    expect(s.filter((x) => x.condition === 'B')).toHaveLength(3);
    expect(s.map((x) => x.i)).toEqual(stratified(items, 9, 7).map((x) => x.i));
  });
});

describe('summary rollup', () => {
  it('pools by condition and by model; by scenario keeps one column per scenario event', () => {
    const l = (scenario: string, condition: 'A' | 'B'): RunLine => ({ ...fakeLine({ actions: [] }), scenario, condition });
    const lines = [l('plan-39', 'A'), l('decline', 'A'), l('plan-39', 'B')];
    expect(new Set(lines.map((x) => groupKey(x, 'condition')))).toEqual(new Set(['A claude-sonnet-5', 'B claude-sonnet-5']));
    expect(new Set(lines.map((x) => groupKey(x, 'model')))).toEqual(new Set(['claude-sonnet-5']));
    expect(new Set(lines.map((x) => groupKey(x, 'scenario'))).size).toBe(3);
    expect(table(lines, 'condition')).toMatch(/outcome match +\| 0\/2 \[0\.00-0\.66\] +\| 0\/1 /);
  });
});

describe('V9 cause: a cap that follows a refused idMismatch is harness-caused', () => {
  const LINK = act('read_link', { party: EMERY, window: { from: '2026-10-10', days: 21 } });
  const CHECK = act('check_calendar', { times: ['2026-10-19T11:30'], durationMin: 60 });

  it('scripted C run: the live harness accepts the yes on the check id at the instant of the link slot; the frozen grader calls it idMismatch, but nothing was refused, so V9 is not the harness\'s', async () => {
    // Ruling 28 (request 1): bd29f14 accepts this yes (onOwnLink), so it is not refused; the graders keep 34013da's guard, which would refuse it.
    // Finding 1 replayed: read the link, check Mon 11:30 on Bob's side, then the yes for Emery on the check's id.
    const line = await runOne(sc, 0, 'C', scripted([LINK, CHECK, act('record_yes', { party: EMERY, slot: 25 })]), 'claude-sonnet-5', 1);
    const yes = line.actions.find((a) => a.tool === 'record_yes')!;
    expect(yes.refused).toBe(false);
    expect(line.graders.idMismatch.fired).toBe(true);
    expect(line.graders.V1.fired).toBe(false);
    expect(line.graders.V9.cause).not.toBe('harness');
    expect(table([line], 'condition')).toMatch(/V9 cap\/loop, harness-caused \(harness-only\) +\| 0\/1/);
  });

  it('the same cap with no idMismatch before it is V9 cause model', async () => {
    const line = await runOne(sc, 0, 'C', scripted([LINK, CHECK]), 'claude-sonnet-5', 1);
    expect(line.outcome).toBe('capped');
    expect(line.graders.idMismatch.fired).toBe(false);
    expect(line.graders.V9).toMatchObject({ fired: true, cause: 'model' });
    expect(isModelViolation(line.graders, 'V9')).toBe(true);
    expect(table([line], 'condition')).toMatch(/any V \(model violation\) +\| 1\/1/);
  });
});

describe('smoke-test fixes: firstStep in every outcome sub-check, negated mode words, no read tools in A', async () => {
  const ro = loadScenario('refuse-offered');
  const roState = planState(ro, 0);
  const w = buildWorld(ro, { offers: resolveEvent(ro, 0).offered });
  const c = startContext(roState);
  await gatherFacts(ro, roState, w, c);
  w.close();
  const snap = snapshot(c);
  const HARPER = 'harper.quill@contractor.example.com';

  it('A: a record_no first step on a scenario expecting propose matches; mustReach and slotWithin do not apply to it', () => {
    const o = gradeRun(ro, 0, roState, run('A0', [action(1, decision('record_no', { party: HARPER, slot: 176, words: 'That one does not work.' }), snap)])).outcome;
    expect(o).toMatchObject({ firstStepMatch: true, reachesRequired: null, slotMatch: null, match: true });
  });

  it('A: a proposal first step still has its slots and recipients checked', () => {
    // Slot 176 is the refused time, before the slotWithin span: a carrier, so the slot check applies and fails.
    const o = gradeRun(ro, 0, roState, run('A0', [action(1, decision('propose', { to: [HARPER], slots: [176] }), snap)])).outcome;
    expect(o).toMatchObject({ firstStepMatch: true, reachesRequired: true, slotMatch: false, match: false });
    // A first step outside firstStep is a miss, as before.
    expect(gradeRun(ro, 0, roState, run('A0', [action(1, decision('wait', { why: 'x' }), snap)])).outcome.match).toBe(false);
  });

  it('ruling 33: an ask that restates offered times is graded on those times under slotWithin', () => {
    // The expectation is propose, alsoAccept ask_party, slotWithin one span from the end of slot 176 to the end of the week.
    const ask = (iso: string): ActionRecord => action(1, decision('ask', { to: [HARPER], text: 'The other times still stand.', subject: 'Times', restates: [iso] }), snap);
    // Slot 177 (Mon Oct 12 4:15pm) is a known slot inside the span.
    expect(gradeRun(ro, 0, roState, run('A', [ask('2026-10-12T20:15:00.000Z')])).outcome).toMatchObject({ actual: 'ask_party', classMatch: true, slotMatch: true, match: true });
    // Slot 176 (the refused time) starts before the span.
    expect(gradeRun(ro, 0, roState, run('A', [ask('2026-10-12T14:45:00.000Z')])).outcome).toMatchObject({ actual: 'ask_party', classMatch: true, slotMatch: false, match: false });
  });

  it('ruling 37: a propose that re-sends a slot already sent to that party is graded as the nudge, not a proposal', async () => {
    // h04 e0 expects ask_bob, alsoAccept ask_party; the opening proposal sent slots 831 to 833 to Kit and Darby and went out.
    const h4 = loadScenario('h04-go-without');
    const h4State = planState(h4, 0);
    const hw = buildWorld(h4, { offers: resolveEvent(h4, 0).offered });
    const hc = startContext(h4State);
    await gatherFacts(h4, h4State, hw, hc);
    hw.close();
    const hs = snapshot(hc);
    const DARBY = 'darby.nandakumar@fernhill.example.org';
    const propose = (slot: number): ActionRecord => action(2, decision('propose', { to: [DARBY], slots: [slot], note: 'Kit can do Wednesday; can you?' }), hs);
    const yes = action(1, decision('record_yes', { party: 'kit.marchetti@fernhill.example.org', slot: 832 }), hs);
    for (const cond of ['B', 'C'] as const) {
      // Slot 832 was offered to Darby and went out: the re-send is an ask restating it.
      expect(gradeRun(h4, 0, h4State, run(cond, [yes, propose(832)])).outcome).toMatchObject({ actual: 'ask_party', classMatch: true, proposedStarts: ['2026-12-09T19:00:00.000Z'] });
      // Slot 837 is a calendar slot never sent to her: a real proposal, the class stays propose.
      expect(gradeRun(h4, 0, h4State, run(cond, [yes, propose(837)])).outcome).toMatchObject({ actual: 'propose', classMatch: false });
    }
  });

  it('V7 mode ignores the other mode named in a negating phrase, both directions, and still fires on a plain one', async () => {
    const ctx = await plan39Context();
    const e0 = sc.events[0]!;
    const withMode = (mode: string): Scenario => ({ ...sc, events: [{ ...e0, expect: { ...e0.expect, constraints: [{ id: 'm', mode }] } as never }, { ...e0, index: 1, expect: e0.expect }] });
    const at1 = { ...resolveEvent(sc, 0), index: 1 };
    const fires = (mode: string, note: string): boolean => gradeRun(withMode(mode), at1, state, run('B', [action(1, decision('propose', { to: [FINLEY], slots: [25], note }), ctx)])).V7.fired;
    expect(fires('virtual', 'Happy to do this virtual instead of in-person.')).toBe(false);
    expect(fires('virtual', 'We switched from in person to a call.')).toBe(false);
    expect(fires('virtual', 'Shall we meet in person at the office?')).toBe(true);
    expect(fires('in-person', 'In person rather than on a video call, as Bob asked.')).toBe(false);
    expect(fires('in-person', 'This is no longer a Zoom meeting.')).toBe(false);
    expect(fires('in-person', "I'll send a Zoom link.")).toBe(true);
  });

  it("A's prompt names no read tool as an action, says why, and keeps its facts", async () => {
    const st39 = planState(sc, 0);
    const w39 = buildWorld(sc); const c39 = startContext(st39);
    const facts = await gatherFacts(sc, st39, w39, c39); w39.close();
    const prompt = barePrompt(st39, 'Bob opened the plan.', facts);
    const actions = prompt.slice(prompt.indexOf('ACTIONS ('));
    for (const t of READ_TOOLS) expect(actions).not.toContain(`{"tool": "${t}"`);
    for (const t of ['propose', 'ask', 'record_yes', 'record_no', 'book', 'tell_bob', 'wait']) expect(actions).toContain(`{"tool": "${t}"`);
    expect(actions).toMatch(/cannot be re-run/);
    // The facts are what they were: the link read and the window check, still above the actions.
    expect(facts.map((f) => f.tool)).toEqual(['read_link', 'check_calendar']);
    expect(prompt.indexOf('FACTS ALREADY GATHERED')).toBeLessThan(prompt.indexOf('ACTIONS ('));
  });
});
