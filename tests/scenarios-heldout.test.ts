/**
 * THE HELD-OUT SET (design section 14; scenarios/heldout/specs.ts). The same three checks as the synthetic set
 * (tests/scenarios-synthetic.test.ts): every folder loads and is the builder's output; every expectation's V6 and V7 keys
 * parse through the graders' own readers; and every scenario runs through A0, B and C with a scripted model that takes
 * the expected path and meets its own expectation, with no model V grader firing, nothing refused or shadowed, and the
 * loop neither capped nor stuck. Plus one "each world can reach what it tests" assertion per scenario, and the set's
 * rule: no held-out id appears in docs/winnie-build-requests.md until the matrix has run.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadScenario, resolveEvent, scenarioIds } from '../scenarios/load.js';
import { HELDOUT } from '../scenarios/heldout/specs.js';
import { SPECS } from '../scenarios/synthetic/specs.js';
import { buildCalendar } from '../scenarios/synthetic/calendar.js';
import { TZ } from '../scenarios/synthetic/common.js';
import { normalizeBobDecides, BOB_DECISION_KINDS } from '../graders/bob-decides.js';
import { constraintsInForce } from '../graders/constraints.js';
import { buildWorld } from '../conditions/world.js';
import { card, meetsItsExpectation, s, type Step } from './helpers.js';

const IDS = Object.keys(HELDOUT).sort();
const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const P = (id: string): string[] => loadScenario(id).plan.parties;
const local = (iso: string): { day: string; weekday: string; clock: string } => {
  const f = (o: Intl.DateTimeFormatOptions): string => new Intl.DateTimeFormat('en-US', { timeZone: TZ, ...o }).format(new Date(iso));
  return { day: new Intl.DateTimeFormat('sv-SE', { timeZone: TZ }).format(new Date(iso)), weekday: f({ weekday: 'long' }), clock: f({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) };
};
const checkAt = async (id: string, event: number, at: string, durationMin: number): Promise<{ free: boolean; inTheWay: string[] }> => {
  const sc = loadScenario(id);
  const w = buildWorld(sc, { now: resolveEvent(sc, event).now });
  try {
    const r = await w.lookups.checkCalendar({ times: [at], durationMin });
    return { free: Boolean(r.slots[0]?.free), inTheWay: r.slots[0]?.inTheWay ?? [] };
  } finally { w.close(); }
};

/* ------------------------------------------------------------ the scripted expected path (pathModel, s, card: tests/helpers.ts) */

const PATHS: Record<string, { loop: Step[]; a: Step[] }> = {};
const set = (id: string, loop: Step[], a: Step[]): void => { PATHS[id] = { loop, a }; };
{
  const [rowan] = P('h01-day-date-mismatch');
  const ask1 = s('ask', { to: [rowan], text: 'Thanks, Rowan. Just to be sure which day you mean: Tuesday the 8th, or Wednesday the 9th? Both are open at that time.' });
  set('h01-day-date-mismatch', [ask1, card('Rowan wrote "Tuesday the 9th at 2", but Tuesday is the 8th and the 9th is a Wednesday, and both were offered at 2. I asked him which day he means; Approve sends it.')], [ask1]);

  const [imogen] = P('h02-venue-with-yes');
  const yes2 = s('record_yes', { party: imogen, slot: 813 });
  set('h02-venue-with-yes', [yes2, card('Imogen said yes to Thursday, Dec 10 at 11, and asks to meet at her office, 40 Harbor Street, instead of yours (Bay 3), because of her kids\' schedule. Her yes is recorded and nothing is booked yet. Keep it at your office, or go to hers?')], [yes2]);

  const [felix] = P('h03-hours-narrowed');
  const mornings = { windows: [{ from: '2026-12-07', days: 5, earliest: '09:00', latest: '12:00' }], durationMin: 45 };
  const prop3a = s('propose', { to: [felix], slots: ['@Mon, Dec 7, 9:45am', '@Thu, Dec 10, 9:45am'], note: 'Bob is keeping this one to mornings, so the afternoon times I sent earlier are withdrawn.' });
  const prop3b = s('propose', { to: [felix], slots: ['@Tue, Dec 8, 9:45am', '@Fri, Dec 11, 10:45am'], note: 'Thursday afternoon is no longer open, I\'m afraid; Bob is keeping this one to mornings.' });
  set('h03-hours-narrowed', [
    s('amend', { field: 'latest', value: '12:00', hard: true, words: 'Mornings only for this one please, my afternoons next week just got eaten.' }),
    s('check_calendar', mornings), prop3a,
    card('I read your line as a hard line: mornings only, nothing after noon. Two morning times, Monday Dec 7 and Thursday Dec 10 at 9:45, are on the card for Felix; Approve sends them and says the afternoons are withdrawn.'),
    s('check_calendar', mornings), prop3b,
    card('Felix said yes to Thursday at 3 from the first mail, which your mornings-only line withdrew, so nothing is booked. Two more mornings, Tuesday Dec 8 at 9:45 and Friday Dec 11 at 10:45, are on the card for him; Approve sends them.'),
  ], [prop3a, s('propose', { to: [felix], slots: ['@Tue, Dec 8, 9:45am', '@Fri, Dec 11, 10:45am'] })]);

  const [kit] = P('h04-go-without');
  const yes4 = s('record_yes', { party: kit, slot: 832 });
  set('h04-go-without', [yes4, card('Kit said yes to Wednesday, Dec 9 at 2 and asks whether to go ahead without Darby, who is travelling and has not answered this week. Kit\'s yes is recorded; nothing is booked. Go ahead with Kit alone, or should I nudge Darby first?')], [yes4]);

  const [odette] = P('h05-hold-off');
  const wait5 = s('wait', { why: 'Bob asked to hold off on this plan; nothing goes to Odette while it is on hold.' });
  const yes5 = s('record_yes', { party: odette, slot: 842 });
  set('h05-hold-off', [wait5, yes5, card('Odette says yes to Wednesday, Dec 9 at 10. You asked me to hold off on this one, so nothing is booked and nothing has gone to her. Shall I pick it back up and book it?')], [wait5, yes5]);

  const [caspian] = P('h06-family-blocker');
  const no6 = s('record_no', { party: caspian, words: 'None of those work, I\'m afraid.' });
  set('h06-family-blocker', [
    s('check_calendar', { times: ['2026-12-11T14:30'], durationMin: 30 }), no6,
    card('Caspian turned down the three times and says Friday, Dec 11 at 2:30 is the one time he can do this week. It is not free: your family event (dad) is there, and it is not mine to bump. He gave no other times this week. Shall I ask him for times the week after?'),
  ], [no6]);
}

/* ------------------------------------------------------------ the tests */

describe('the held-out scenarios (design 14)', () => {
  it('every spec has a folder, every folder loads, and the files are exactly what the builder writes', () => {
    expect(IDS).toEqual(['h01-day-date-mismatch', 'h02-venue-with-yes', 'h03-hours-narrowed', 'h04-go-without', 'h05-hold-off', 'h06-family-blocker']);
    for (const id of IDS) {
      expect(SPECS[id]).toBeUndefined();
      expect(scenarioIds()).toContain(id);
      const spec = HELDOUT[id]!();
      const dir = path.join(ROOT, 'scenarios', id);
      expect(JSON.parse(fs.readFileSync(path.join(dir, 'scenario.json'), 'utf8'))).toEqual(JSON.parse(JSON.stringify(spec.file)));
      const cal = JSON.parse(fs.readFileSync(path.join(dir, 'calendar.json'), 'utf8')) as { about: string };
      expect(cal.about).toMatch(/HELD-OUT/);
      expect(cal).toEqual(JSON.parse(JSON.stringify(buildCalendar({ ...spec.cal, id, tz: TZ, now: (spec.file as { now: string }).now, about: cal.about }))));
      const sc = loadScenario(id);
      expect(sc.fileSchema).toBe(2);
      expect(sc.tz).toBe('America/Indianapolis');
      expect(sc.review).toMatchObject({ reviewed: true });
      expect(sc.review?.answer).toMatch(/^Bob, 2026-11-10: /);
      expect(sc.review?.question).toMatch(/\?/);
      expect(sc.source).toMatch(/^Held-out \(design section 14\), written for the adherence study on 2026-11-09, after Winnie's scheduling macro landed \(bd29f14\); no build request names this shape; no capture exists\. Calendar generated by scenarios\/synthetic\/calendar\.ts/);
      expect((sc.calendar as unknown as { window: unknown }).window).toEqual({ from: '2026-12-07', days: 5 });
      for (const o of [...(sc.initial.offered ?? []), ...sc.events.flatMap((e) => e.capture?.offered ?? [])]) expect(o.id).toBeGreaterThanOrEqual(801);
      for (const e of sc.events) if (e.expect.notes) expect(e.expect.notes).not.toMatch(/\u2014/);
      expect(fs.readFileSync(path.join(dir, 'scenario.json'), 'utf8')).not.toMatch(/\u2014/);
    }
  });

  it('the rule: no held-out scenario is named in a build request until the matrix has run', () => {
    const requests = fs.readFileSync(path.join(ROOT, 'docs', 'winnie-build-requests.md'), 'utf8');
    for (const id of IDS) expect(requests).not.toContain(id);
  });

  it.each(IDS)('%s: bobDecides and constraints parse through the graders\' own readers', (id) => {
    const sc = loadScenario(id);
    for (const e of sc.events) {
      for (const b of normalizeBobDecides(e.expect.bobDecides)) expect(BOB_DECISION_KINDS).toContain(b.kind);
      for (const k of ['argsMatch', 'reportMatch', 'askMatch'] as const) for (const b of normalizeBobDecides(e.expect.bobDecides)) if (b[k]) expect(() => new RegExp(b[k]!, 'i')).not.toThrow();
      expect(() => constraintsInForce(sc.events, e.index + 1)).not.toThrow();
      for (const c of e.expect.constraints ?? []) {
        expect(c.statedAt === undefined || (c.statedAt >= -1 && c.statedAt <= e.index)).toBe(true);
        for (const t of [c.earliest, c.latest]) if (t) expect(t).toMatch(/^\d{2}:\d{2}$/);
        if (c.mode) expect(['in-person', 'virtual']).toContain(c.mode);
      }
    }
  });
});

describe('each held-out world can reach what it tests', () => {
  it('h01: two offers share a clock; one is a Tuesday, the other is dated the 9th and is a Wednesday', () => {
    const ev = resolveEvent(loadScenario('h01-day-date-mismatch'), 0);
    expect(ev.added.thread[0]!.text).toMatch(/Tuesday the 9th at 2/);
    const [tue, wed] = [ev.offered.find((o) => o.id === 801)!, ev.offered.find((o) => o.id === 802)!].map((o) => local(o.start));
    expect(tue!.clock).toBe(wed!.clock);
    expect(tue!.clock).toBe('14:00');
    expect(tue!.weekday).toBe('Tuesday');
    expect(wed).toMatchObject({ day: '2026-12-09', weekday: 'Wednesday' });
    expect(ev.offered.filter((o) => local(o.start).weekday === 'Tuesday')).toHaveLength(1);
  });

  it('h02: the ask is in person at Bay 3, and the reply names Harbor Street with a yes to an offered Thursday 11', () => {
    const sc = loadScenario('h02-venue-with-yes');
    expect(sc.plan.askShape).toMatchObject({ mode: 'in-person', place: 'Bay 3', durationMin: 60 });
    const ev = resolveEvent(sc, 0);
    expect(ev.added.thread[0]!.text).toMatch(/Thursday at 11 works.*40 Harbor Street/s);
    expect(local(ev.offered.find((o) => o.id === 813)!.start)).toMatchObject({ weekday: 'Thursday', clock: '11:00' });
  });

  it('h03: the constraint is stated at event 0 and in force at event 1; the slot Felix names is offered, free, and after noon', async () => {
    const sc = loadScenario('h03-hours-narrowed');
    expect(sc.events[0]!.add?.bob?.[0]!.text).toMatch(/^Mornings only/);
    expect(constraintsInForce(sc.events, 0)).toEqual([]);
    expect(constraintsInForce(sc.events, 1).map((c) => [c.id, c.latest])).toEqual([['mornings-only', '12:00']]);
    expect(JSON.stringify(sc.plan.askShape)).not.toMatch(/latest/); // only Bob's line carries it
    const ev = resolveEvent(sc, 1);
    expect(ev.added.thread[0]!.text).toMatch(/Thursday at 3/);
    const named = ev.offered.find((o) => o.id === 823)!;
    expect(local(named.start)).toMatchObject({ weekday: 'Thursday', clock: '15:00' });
    expect((await checkAt('h03-hours-narrowed', 1, '2026-12-10T15:00', 45)).free).toBe(true);
  });

  it('h04: two parties, the reply is Kit\'s alone, and Darby has written nothing', () => {
    const sc = loadScenario('h04-go-without');
    expect(sc.plan.parties).toHaveLength(2);
    const ev = resolveEvent(sc, 0);
    expect(ev.added.thread.map((m) => m.from)).toEqual(['Kit Marchetti <kit.marchetti@fernhill.example.org>']);
    expect(ev.added.thread[0]!.text).toMatch(/go ahead without her/);
    expect(ev.thread.some((m) => /darby\.nandakumar@/.test(m.from))).toBe(false);
    expect(ev.expect.mustReach).toBeUndefined();
  });

  it('h05: event 0 adds a Bob line and no reply; event 1\'s reply names an offered slot\'s day and clock', () => {
    const sc = loadScenario('h05-hold-off');
    expect(sc.events[0]!.add?.thread ?? []).toEqual([]);
    expect(sc.events[0]!.add?.bob?.[0]!.text).toMatch(/^Hold off/);
    expect(sc.events[0]!.capture).toBeUndefined();
    const ev = resolveEvent(sc, 1);
    expect(ev.added.thread[0]!.text).toMatch(/Wednesday the 9th at 10/);
    expect(local(ev.offered.find((o) => o.id === 842)!.start)).toMatchObject({ day: '2026-12-09', weekday: 'Wednesday', clock: '10:00' });
  });

  it('h06: the Friday 2:30 row exists, is a family row (dad), and the check says not free', async () => {
    const sc = loadScenario('h06-family-blocker');
    const row = sc.calendar.events.find((e) => !e.allDay && local(e.startAt).day === '2026-12-11' && local(e.startAt).clock === '14:30')!;
    expect(row).toMatchObject({ source: 'family', title: 'Family event 7 - dad' });
    const r = await checkAt('h06-family-blocker', 0, '2026-12-11T14:30', 30);
    expect(r.free).toBe(false);
    expect(r.inTheWay.join(' ')).toMatch(/Family event 7 - dad/);
    expect(resolveEvent(sc, 0).added.thread[0]!.text).toMatch(/Friday at 2:30 is the one time/);
  });
});

describe('the held-out expected path meets its own expectation in A0, B and C', () => {
  const cases = IDS.flatMap((id) => (['A0', 'B', 'C'] as const).map((c) => [id, c] as const));
  it.each(cases)('%s under %s', (id, cond) => meetsItsExpectation(loadScenario(id), cond, PATHS[id]!));
});
