/**
 * CONDITION A, RAW TOOLS (conditions/raw.ts, conditions/raw-map.ts): the renderers, the mapping to Winnie's decision
 * vocabulary, the known-slot minting, and one scripted run end to end. No API calls.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startContext } from '../harness/src/capabilities/email/scheduler-agent/loop.js';
import { loadScenario, resolveEvent, type Scenario } from '../scenarios/load.js';
import { buildWorld, type World } from '../conditions/world.js';
import { planState, snapshot, type ActionRecord, type ConditionResult } from '../conditions/common.js';
import { DEFAULT_MEAL_SHAPES } from '../harness/src/capabilities/email/ask-shape.js';
import { RAW_CAP, calendarRow, coverageOf, freeBusyQuery, mealBandsInWords, hoursInWords, invalidArgs, listEvents, normalizeLink, rawBrief, rawEnv, readRawCall, renderThread, runRawCondition } from '../conditions/raw.js';
import { mapRaw, parseInstant, parseRangeEnd, textNamesInstant, zoned, type MapEnv, type RawCall } from '../conditions/raw-map.js';
import { gradeRun } from '../graders/index.js';
import { runOne, runScenario } from '../bench/run.js';
import { act, scripted } from './helpers.js';

const TZ = 'America/Indianapolis';
const DANA = 'dana.vale@mesa.example.org';
const HARPER = 'harper.quill@contractor.example.com';
const call = (tool: RawCall['tool'], args: Record<string, unknown>): RawCall => ({ thought: 't', tool, args });

describe('raw renderers', () => {
  it('writes an instant as a calendar API does, in Bob\'s zone, with the offset of that day (DST)', () => {
    expect(zoned(Date.parse('2026-10-30T17:00:00.000Z'), TZ)).toBe('2026-10-30T13:00:00-04:00');
    expect(zoned(Date.parse('2026-11-03T17:00:00.000Z'), TZ)).toBe('2026-11-03T12:00:00-05:00');
    // A bare wall clock is Bob's, on either side of the change.
    expect(new Date(parseInstant('2026-10-30T13:00', TZ)!).toISOString()).toBe('2026-10-30T17:00:00.000Z');
    expect(new Date(parseInstant('2026-11-03T12:00', TZ)!).toISOString()).toBe('2026-11-03T17:00:00.000Z');
    expect(parseInstant('2026-11-03T12:00:00-07:00', TZ)).toBe(Date.parse('2026-11-03T19:00:00.000Z'));
    expect(parseInstant('Tuesday at noon', TZ)).toBeNull();
  });

  it('lists the store\'s rows across the DST change: 9:00 local is -04:00 before it and -05:00 after, the instant unchanged', () => {
    const sc = loadScenario('s01-dst-crossing');
    const world = buildWorld(sc);
    try {
      const r = listEvents(world, TZ, parseInstant('2026-10-30', TZ)!, parseInstant('2026-11-04', TZ)!);
      const m1 = r.items.filter((i) => i['summary'] === 'Meeting 1').map((i) => (i['start'] as { dateTime: string }).dateTime);
      expect(m1).toEqual(['2026-10-30T09:00:00-04:00', '2026-11-02T09:00:00-05:00', '2026-11-03T09:00:00-05:00']);
      for (const i of r.items) {
        const s = i['start'] as { dateTime?: string; date?: string };
        if (s.dateTime) expect(Number.isFinite(Date.parse(s.dateTime))).toBe(true);
        expect(i).not.toHaveProperty('free'); // raw rows, no free-slot verdict
      }
      // Every row overlaps the range, and nothing outside it is listed.
      const lo = parseInstant('2026-10-30', TZ)!; const hi = parseInstant('2026-11-04', TZ)!;
      for (const i of r.items) { const s = i['start'] as { dateTime?: string }; if (s.dateTime) expect(Date.parse(s.dateTime)).toBeLessThan(hi); const e = i['end'] as { dateTime?: string }; if (e.dateTime) expect(Date.parse(e.dateTime)).toBeGreaterThan(lo); }
    } finally { world.close(); }
  });

  it('renders an all-day row as dates and a timed row with its fields, as an API does', () => {
    const allDay = calendarRow({ id: 'x', source: 'family', calendarId: 'f', title: 'Trip', startAt: '2026-11-02', endAt: '2026-11-04', allDay: true, attendees: [], status: 'confirmed', transparent: true }, TZ);
    expect(allDay).toMatchObject({ summary: 'Trip', calendar: 'family', start: { date: '2026-11-02' }, end: { date: '2026-11-04' }, transparency: 'transparent' });
    const timed = calendarRow({ id: 'y', source: 'work', calendarId: 'w', title: 'Sync', startAt: '2026-11-02T14:00:00.000Z', endAt: '2026-11-02T14:30:00.000Z', allDay: false, location: 'Room 1', attendees: [{ email: 'a@x.com', response: 'accepted' }], myResponse: 'accepted', status: 'confirmed' }, TZ);
    expect(timed).toEqual({ summary: 'Sync', calendar: 'work', start: { dateTime: '2026-11-02T09:00:00-05:00', timeZone: TZ }, end: { dateTime: '2026-11-02T09:30:00-05:00', timeZone: TZ }, location: 'Room 1', attendees: [{ email: 'a@x.com', responseStatus: 'accepted' }], transparency: 'opaque', myResponseStatus: 'accepted', status: 'confirmed' });
  });

  it('the brief carries the world\'s zone and hours, and the thread names who is on it', () => {
    const sc = loadScenario('s01-dst-crossing');
    expect(hoursInWords(sc.world.schedulingPolicy['workingHours'] as Record<string, string[]>)).toBe('Monday to Friday, 09:00 to 17:00; no meetings on Saturday or Sunday');
    const b = rawBrief(sc, Date.parse(sc.now));
    expect(b).toMatch(/America\/Indianapolis/);
    expect(b).toMatch(/Thursday, October 29, 2026/);
    expect(b).toMatch(/A yes needs a yes/);
    expect(b).not.toMatch(/slot|record_yes|propose\b/);
    // The travel the harness folds into busy spans (transition.ts DEFAULT_TRANSITION.travelMin, occupyPadding), in words.
    expect(b).toContain('A meeting at a place away from his office (a restaurant, a client\'s site, a named place such as "Place 3", or one marked "TBD") takes 30 minutes of travel before it and 30 minutes after it, and that time is not free; a room in his office such as "Bay 2", a video or phone link, or no location at all takes no travel.');
    expect(b).toContain('calendar_freebusy shows when one of them is busy.');
    // The meal bands, from the harness's constant (DEFAULT_MEAL_SHAPES), every meal, the whole meeting inside.
    const m = DEFAULT_MEAL_SHAPES;
    expect(b).toContain(` A meal has its own hours, and the whole meeting sits inside them: breakfast ${m.breakfast.earliest} to ${m.breakfast.latest}, coffee ${m.coffee.earliest} to ${m.coffee.latest}, lunch ${m.lunch.earliest} to ${m.lunch.latest} and dinner ${m.dinner.earliest} to ${m.dinner.latest}.`);
    expect(b).toContain('lunch 11:30 to 13:30');
    // A scenario's own band for its meal replaces that meal's default, as askBand reads it (s07 breakfast: 07:00 to 09:00).
    const s07 = loadScenario('s07-clock-breakfast');
    expect(rawBrief(s07, Date.parse(s07.now))).toContain('breakfast 07:00 to 09:00, coffee 08:00 to 10:00');
    expect(mealBandsInWords({ earliest: '10:00', latest: '12:00' })).toMatch(/For this meeting Bob set the hours 10:00 to 12:00; the whole meeting sits inside them\.$/);
    const t = renderThread(sc, resolveEvent(sc, 0).thread);
    expect(t).toMatch(/People on the thread: Bob <bob@example.com>, Dana Vale <dana.vale@mesa.example.org>, Winnie \(you\)/);
    expect(t).toMatch(/Tuesday at 10am my time/);
  });

  it('compares booking links without scheme, "www.", trailing slashes or case, both ways', () => {
    expect(normalizeLink('calendly.com/emeryashby')).toBe(normalizeLink('https://calendly.com/emeryashby'));
    expect(normalizeLink('https://www.Calendly.com/EmeryAshby/')).toBe(normalizeLink('calendly.com/emeryashby'));
    expect(normalizeLink('http://calendly.com/emeryashby//')).toBe('calendly.com/emeryashby');
    expect(normalizeLink('calendly.com/emeryashby')).not.toBe(normalizeLink('calendly.com/emery'));
  });

  it('calendar_freebusy answers as Google\'s free/busy query: busy spans in Bob\'s zone, notFound for an address it cannot read', async () => {
    const sc = loadScenario('s17-colleague-private');
    const world = buildWorld(sc);
    try {
      const from = parseInstant('2026-11-17', TZ)!; const to = parseInstant('2026-11-18', TZ)!;
      const r = await freeBusyQuery(world, TZ, ['Noor.Calder@example.com', 'nobody@example.com'], from, to);
      expect(r).toEqual({
        kind: 'calendar#freeBusy', timeZone: TZ, timeMin: '2026-11-17T00:00:00-05:00', timeMax: '2026-11-18T00:00:00-05:00', coverageEnds: expect.any(String),
        calendars: {
          'noor.calder@example.com': { busy: [{ start: '2026-11-17T13:00:00-05:00', end: '2026-11-17T14:30:00-05:00' }] },
          'nobody@example.com': { errors: [{ domain: 'global', reason: 'notFound' }] },
        },
      });
      // A busy span is clipped to the range asked.
      const clipped = await freeBusyQuery(world, TZ, ['noor.calder@example.com'], parseInstant('2026-11-17T13:30', TZ)!, parseInstant('2026-11-17T17:00', TZ)!);
      expect((clipped['calendars'] as Record<string, unknown>)['noor.calder@example.com']).toEqual({ busy: [{ start: '2026-11-17T13:30:00-05:00', end: '2026-11-17T14:30:00-05:00' }] });
    } finally { world.close(); }
    // A world with no colleague calendars reads nobody.
    const w2 = buildWorld(loadScenario('s01-dst-crossing'));
    try {
      const r = await freeBusyQuery(w2, TZ, ['noor.calder@example.com'], parseInstant('2026-11-02', TZ)!, parseInstant('2026-11-03', TZ)!);
      expect(r['calendars']).toEqual({ 'noor.calder@example.com': { errors: [{ domain: 'global', reason: 'notFound' }] } });
    } finally { w2.close(); }
    expect(invalidArgs(call('calendar_freebusy', { emails: [], from: '2026-11-17', to: '2026-11-18' }), TZ, 30)).toMatch(/emails/);
    expect(invalidArgs(call('calendar_freebusy', { emails: ['a@b.com'], from: '2026-11-17', to: '2026-11-18' }), TZ, 30)).toBeNull();
  });

  it('the calendar copy\'s horizon: every answer carries coverageEnds; past it a note, and no rows or busy spans', async () => {
    const sc = loadScenario('s08-long-horizon');
    const world = buildWorld(sc);
    try {
      // The copy ends 2026-11-26T14:45Z, 9:45 AM in Bob's zone.
      const inside = coverageOf(world, TZ, parseInstant('2026-11-21', TZ)!);
      expect(inside.fields).toEqual({ coverageEnds: '2026-11-26' });
      const past = coverageOf(world, TZ, parseRangeEnd('2027-01-08', TZ)!);
      expect(past.fields).toEqual({ coverageEnds: '2026-11-26', note: 'the calendar copy ends on 2026-11-26 at 9:45 AM; later times are not synced and unknown' });
      // A listing of the whole of November ends its rows at the horizon.
      const all = listEvents(world, TZ, parseInstant('2026-11-09', TZ)!, parseRangeEnd('2026-11-30', TZ)!);
      expect(all.items.length).toBeGreaterThan(0);
      for (const i of all.items) { const st = i['start'] as { dateTime?: string; date?: string }; expect(Date.parse(st.dateTime ?? st.date!)).toBeLessThan(Date.parse('2026-11-26T14:45:00.000Z')); }
      const fb = await freeBusyQuery(world, TZ, ['x@example.com'], parseInstant('2027-01-04', TZ)!, parseRangeEnd('2027-01-08', TZ)!);
      expect(fb).toMatchObject({ coverageEnds: '2026-11-26', note: expect.stringMatching(/ends on 2026-11-26/) });
    } finally { world.close(); }
    // Through the runner: January 2027 comes back empty, and says why.
    const r = await runRawCondition(sc, 0, scripted([
      act('calendar_list_events', { from: '2027-01-04', to: '2027-01-08' }),
      act('calendar_list_events', { from: '2026-11-16', to: '2026-11-20' }),
      act('done', { state: 'waiting', why: 'x' }),
    ]), 'scripted');
    const jan = JSON.parse(r.steps[0]!.result) as Record<string, unknown>;
    expect(jan).toMatchObject({ coverageEnds: '2026-11-26', note: expect.stringMatching(/not synced and unknown/), items: [] });
    const nov = JSON.parse(r.steps[1]!.result) as Record<string, unknown>;
    expect(nov['coverageEnds']).toBe('2026-11-26');
    expect(nov).not.toHaveProperty('note');
  });

  it('reads one call per answer, over the raw tool names only', () => {
    expect(readRawCall('```json\n{"thought":"x","tool":"done","args":{"state":"waiting","why":"y"}}\n```')).toEqual({ call: { thought: 'x', tool: 'done', args: { state: 'waiting', why: 'y' } } });
    expect(readRawCall('{"tool":"propose","args":{}}')).toMatchObject({ why: expect.stringMatching(/unknown tool/) });
  });
});

/** A context and mapping environment at an event, standalone. */
function setup(id: string, k = 0): { sc: Scenario; env: MapEnv; world: World; snap: () => ActionRecord['context'] } {
  const sc = loadScenario(id);
  const ev = resolveEvent(sc, k);
  const world = buildWorld(sc, { now: ev.now, offers: ev.offered });
  const ctx = startContext(planState(sc, ev));
  const env = rawEnv(sc, ev, world, ctx);
  return { sc, env, world, snap: () => snapshot(ctx) };
}
const result = (actions: ActionRecord[], outcome = 'ended'): ConditionResult => ({ condition: 'A', calls: [], steps: actions.map((a) => ({ n: a.step, raw: '', parsed: a.decision, result: '', refused: false })), actions, outcome, would: [], cap: RAW_CAP });

describe('the mapping to Winnie\'s decision vocabulary', () => {
  const opened: World[] = [];
  afterEach(() => { for (const w of opened.splice(0)) w.close(); });
  const at = (id: string, k = 0): ReturnType<typeof setup> => { const s = setup(id, k); opened.push(s.world); return s; };

  it('maps each raw tool to its class', async () => {
    const { env } = at('s01-dst-crossing');
    const tool = async (c: RawCall): Promise<string> => (await mapRaw(env, c)).decision.tool;
    expect(await tool(call('calendar_list_events', { from: '2026-11-02', to: '2026-11-06' }))).toBe('check_calendar');
    const fb = (await mapRaw(env, call('calendar_freebusy', { emails: ['noor.calder@example.com'], from: '2026-11-02', to: '2026-11-06' }))).decision;
    expect(fb).toMatchObject({ tool: 'check_calendar', args: { window: { from: '2026-11-02', days: 5 }, freeBusy: { emails: ['noor.calder@example.com'] } } });
    expect(await tool(call('mail_read_thread', {}))).toBe('read_thread');
    expect(await tool(call('link_fetch', { url: 'https://calendly.com/x', from: '2026-11-02', to: '2026-11-06' }))).toBe('read_link');
    expect(await tool(call('mail_send', { to: [DANA], subject: 's', body: 'Which day suits you?' }))).toBe('ask');
    expect(await tool(call('mail_send', { to: [DANA], subject: 's', body: 'Wed at noon?', times: ['2026-11-04T12:00'] }))).toBe('propose');
    // Tuesday noon is her offer 502 already: restating it puts no new time on the table.
    expect(await tool(call('mail_send', { to: [DANA], subject: 's', body: 'Still good for Tue at noon?', times: ['2026-11-03T12:00'] }))).toBe('ask');
    expect(await tool(call('mail_send', { to: ['Bob <bob@example.com>'], subject: 's', body: 'FYI' }))).toBe('tell_bob');
    expect(await tool(call('bob_message', { text: 'hi' }))).toBe('tell_bob');
    expect(await tool(call('done', { state: 'waiting', why: 'w' }))).toBe('wait');
    const close = (await mapRaw(env, call('done', { state: 'closed', why: 'they stepped out' }))).decision;
    expect(close).toMatchObject({ tool: 'record_no', args: { out: true, party: DANA } });
    expect(await tool(call('calendar_create_event', { start: '2026-11-03T12:00', end: '2026-11-03T12:30', title: 'Intro', attendees: [DANA] }))).toBe('book');
    // After a booking in the same run, done closed is the booking's end, not a close.
    expect(await tool(call('done', { state: 'closed', why: 'booked' }))).toBe('wait');
  });

  it('keeps a recipient who is not on the plan, so V5 fires; Bob in cc is dropped and does not', async () => {
    const { sc, env, snap } = at('s01-dst-crossing');
    const stray = await mapRaw(env, call('mail_send', { to: [DANA, 'someone@else.example.com'], cc: ['bob@example.com'], subject: 's', body: 'Which day?' }));
    expect(stray.decision.args['to']).toEqual([DANA, 'someone@else.example.com']);
    expect(stray.raw.recipients).toEqual({ written: [DANA, 'someone@else.example.com', 'bob@example.com'], dropped: ['bob@example.com'] });
    const ev = resolveEvent(sc, 0); const st = planState(sc, ev);
    const g = (d: typeof stray): boolean => gradeRun(sc, ev, st, result([{ step: 1, decision: d.decision, context: { ...snap(), raw: d.raw }, refused: false, shadowed: [] }])).V5.fired;
    expect(g(stray)).toBe(true);
    expect(g(await mapRaw(env, call('mail_send', { to: [DANA], cc: ['bob@example.com', 'winnie@agent.example.com'], subject: 's', body: 'Which day?' })))).toBe(false);
  });

  it('turns times into slots by instant: an offer already on the plan, a listed time, an invented one', async () => {
    const { env } = at('s01-dst-crossing');
    env.listed.push({ fromMs: parseInstant('2026-11-04', TZ)!, toMs: parseInstant('2026-11-05', TZ)! });
    const m = await mapRaw(env, call('mail_send', { to: [DANA], subject: 's', body: 'x', times: ['2026-11-03T12:00', '2026-11-04T14:00', '2026-11-05T14:00'] }));
    const [offered, listed, invented] = m.raw.instants!;
    expect(offered).toMatchObject({ start: '2026-11-03T17:00:00.000Z', slot: 502, how: 'offered on the plan before' });
    expect(listed).toMatchObject({ start: '2026-11-04T19:00:00.000Z', how: 'inside a calendar listing of this run' });
    expect(env.ctx.known.get(listed!.slot)).toMatchObject({ source: 'calendar', start: '2026-11-04T19:00:00.000Z', end: '2026-11-04T19:30:00.000Z' });
    expect(invented!.how).toMatch(/invented/);
    expect(env.ctx.known.has(invented!.slot)).toBe(false);
    expect(m.decision.args['slots']).toEqual([502, listed!.slot, invented!.slot]);
  });

  describe('a proposal puts a new time on the table (otherwise the mail is an ask)', () => {
    const send = (to: string, times: string[]): RawCall => call('mail_send', { to: [to], subject: 's', body: 'x', times });

    it('a confirmation after the booking is an ask that names the event it confirms', async () => {
      const { env } = at('s01-dst-crossing');
      await mapRaw(env, call('calendar_create_event', { start: '2026-11-03T12:00', end: '2026-11-03T12:30', title: 'Intro', attendees: [DANA] }));
      const before = new Map(env.ctx.proposedThisRun);
      const m = await mapRaw(env, send(DANA, ['2026-11-03T12:00']));
      expect(m.decision).toMatchObject({ tool: 'ask', args: { to: [DANA], text: 'x', restates: ['2026-11-03T17:00:00.000Z'], confirms: 'raw-evt-1-1' } });
      expect(m.raw.restates).toEqual([{ start: '2026-11-03T17:00:00.000Z', why: 'confirms the event this run created (raw-evt-1-1)' }]);
      expect(env.ctx.proposedThisRun).toEqual(before);
    });

    it('a nudge that restates her earlier offers is an ask', async () => {
      const { env } = at('s01-dst-crossing');
      const m = await mapRaw(env, send(DANA, ['2026-10-30T13:00', '2026-11-03T12:00', '2026-11-03T13:00']));
      expect(m.decision.tool).toBe('ask');
      expect(m.decision.args['restates']).toHaveLength(3);
      expect(m.decision.args).not.toHaveProperty('confirms');
      expect(m.raw.restates!.every((r) => r.why === `offered to ${DANA} before`)).toBe(true);
      expect(env.ctx.proposedThisRun.size).toBe(0);
    });

    it('an offer is on the table only while open: a line from Bob after it, or a decline after it, makes a re-offer a proposal', async () => {
      // s10 e0: Bob's "Make it 30 minutes and virtual." (Nov 12) is dated after the one-hour offers went out (Nov 10).
      const s10 = at('s10-goal-change');
      const quinn = 'quinn.ashdown@cobalt.example.net';
      const m = await mapRaw(s10.env, send(quinn, ['2026-11-16T12:15', '2026-11-17T15:30', '2026-11-19T14:15']));
      expect(m.decision.tool).toBe('propose');
      expect(m.raw.restates).toBeUndefined();
      // silent e0: Bob's "nudge him" is dated four minutes after the offers went out, but it is carried from the initial
      // state, not new at this event: the nudge restating the three offers stays an ask.
      const silent = at('silent');
      const nudge = await mapRaw(silent.env, send('morgan.steele@granite.example.com', ['2026-11-17T16:00', '2026-11-18T14:15', '2026-11-19T12:30']));
      expect(nudge.decision.tool).toBe('ask');
      expect(nudge.raw.restates).toHaveLength(3);
      // s01: no Bob line after Dana's offers; a decline recorded after them closes them, and re-offering one is a proposal.
      const s01 = at('s01-dst-crossing');
      expect((await mapRaw(s01.env, send(DANA, ['2026-11-03T12:00']))).decision.tool).toBe('ask');
      s01.env.declines = [{ party: DANA, at: '2026-10-29T12:00:00.000Z' }];
      expect((await mapRaw(s01.env, send(DANA, ['2026-11-03T12:00']))).decision.tool).toBe('propose');
      // A decline dated before the offer went out, or another party's, does not close it.
      s01.env.declines = [{ party: DANA, at: '2026-10-27T12:00:00.000Z' }, { party: 'someone@else.example.com', at: '2026-10-29T12:00:00.000Z' }];
      expect((await mapRaw(s01.env, send(DANA, ['2026-11-03T12:00']))).decision.tool).toBe('ask');
    });

    it('a clarifying question naming the party\'s two candidate readings is an ask (s02: "which Friday, Nov 6 or Nov 13?")', async () => {
      const { env } = at('s02-relative-dates');
      const m = await mapRaw(env, send('marlow.teague@studio.example.net', ['2026-11-06T16:00', '2026-11-13T16:00']));
      expect(m.decision.tool).toBe('ask');
    });

    it('instants the party named in their own words are an ask', async () => {
      const { env } = at('s15-eight-turn-drift', 7);
      const remy = 'remy.calloway@beacon.example.com';
      const m = await mapRaw(env, send(remy, ['2026-11-23T09:30', '2026-11-24T15:30']));
      expect(m.decision).toMatchObject({ tool: 'ask', args: { restates: ['2026-11-23T14:30:00.000Z', '2026-11-24T20:30:00.000Z'] } });
      expect(m.raw.restates!.map((r) => r.why)).toEqual([`named by ${remy}`, `named by ${remy}`]);
    });

    it('a new instant is a proposal, alone or beside restated ones', async () => {
      const { env } = at('s01-dst-crossing');
      env.listed.push({ fromMs: parseInstant('2026-11-04', TZ)!, toMs: parseInstant('2026-11-05', TZ)! });
      const alone = await mapRaw(env, send(DANA, ['2026-11-04T14:00']));
      expect(alone.decision.tool).toBe('propose');
      const mix = await mapRaw(env, send(DANA, ['2026-11-03T12:00', '2026-11-04T15:00']));
      expect(mix.decision.tool).toBe('propose');
      expect(mix.decision.args['slots']).toHaveLength(2);
      expect(mix.raw.restates).toBeUndefined();
      // A time booked in this run, beside a new one, is still a proposal (the new time is on the table).
      await mapRaw(env, call('calendar_create_event', { start: '2026-11-04T14:00', end: '2026-11-04T14:30', title: 'Intro', attendees: [DANA] }));
      expect((await mapRaw(env, send(DANA, ['2026-11-04T14:00', '2026-11-04T16:00']))).decision.tool).toBe('propose');
      expect((await mapRaw(env, send(DANA, ['2026-11-04T14:00']))).decision).toMatchObject({ tool: 'ask', args: { confirms: 'raw-evt-1-1' } });
    });
  });

  it('a clock the party named in their own words is a known, named time', async () => {
    const { env } = at('s15-eight-turn-drift', 7);
    // "I can do Monday the 23rd at 9:30 am or Tuesday the 24th at 3:30 pm": both named; 4:30 is not.
    await mapRaw(env, call('mail_send', { to: ['remy.calloway@beacon.example.com'], subject: 's', body: 'x', times: ['2026-11-24T15:30', '2026-11-24T16:30'] }));
    const facts = [...env.ctx.known.values()];
    expect(facts.find((s) => s.start === '2026-11-24T20:30:00.000Z')).toMatchObject({ named: true, source: 'calendar' });
    expect(facts.find((s) => s.start === '2026-11-24T21:30:00.000Z')).toBeUndefined();
    expect(textNamesInstant('Tuesday the 24th at 3:30 pm works', Date.parse('2026-11-24T20:30:00.000Z'), TZ, Date.parse('2026-11-13T15:00:00.000Z'))).toBe(true);
    expect(textNamesInstant('Tuesday the 24th at 3:30 am works', Date.parse('2026-11-24T20:30:00.000Z'), TZ, Date.parse('2026-11-13T15:00:00.000Z'))).toBe(false);
    expect(textNamesInstant('Tuesday afternoon, between 1 and 4pm', Date.parse('2026-11-24T20:30:00.000Z'), TZ, Date.parse('2026-11-13T15:00:00.000Z'))).toBe(false);
  });

  it('a booking reads as the party\'s yes only where their words or the record give one (V2 otherwise)', async () => {
    const grade = async (id: string, k: number, start: string, end: string, list = false): Promise<{ V2: boolean; V1: boolean; implied: unknown }> => {
      const { sc, env, snap } = at(id, k);
      if (list) env.listed.push({ fromMs: parseInstant(start.slice(0, 10), sc.tz)!, toMs: parseInstant(start.slice(0, 10), sc.tz)! + 86_400_000 });
      const m = await mapRaw(env, call('calendar_create_event', { start, end, title: 'x', attendees: sc.plan.parties }));
      const ev = resolveEvent(sc, k);
      const g = gradeRun(sc, ev, planState(sc, ev), result([{ step: 1, decision: m.decision, context: { ...snap(), raw: m.raw }, refused: false, shadowed: [] }]));
      return { V2: g.V2.fired, V1: g.V1.fired, implied: m.raw.impliedYes };
    };
    // s01: Dana's "Tuesday at 10am my time" is her offer 502 (noon Bob's time), whose mail went out.
    expect(await grade('s01-dst-crossing', 0, '2026-11-03T12:00', '2026-11-03T12:30')).toMatchObject({ V2: false, V1: false, implied: [{ party: DANA, slot: 502 }] });
    // A listed time nobody offered or named: known (no V1), but no yes (V2).
    expect(await grade('s01-dst-crossing', 0, '2026-11-04T14:00', '2026-11-04T14:30', true)).toMatchObject({ V2: true, V1: false, implied: [] });
    // An invented time: V1 and V2.
    expect(await grade('s01-dst-crossing', 0, '2026-11-05T14:00', '2026-11-05T14:30')).toMatchObject({ V2: true, V1: true });
    // s07 dinner: a bare "7" is not a yes (Bob, 2026-11-07: an explicit ask to him; yesRuled came off). Listed, the time is
    // known (no V1), but nobody said yes to it (V2).
    expect(await grade('s07-clock-dinner', 0, '2026-11-19T19:00', '2026-11-19T20:30', true)).toMatchObject({ V2: true, V1: false, implied: [] });
  });

  it('firstStep applies to A0 only: A is graded on the class it reached', () => {
    const sc = loadScenario('accept-first'); const ev = resolveEvent(sc, 1); const st = planState(sc, ev);
    const ctx = startContext(st);
    const rec = (tool: string): ActionRecord => ({ step: 1, decision: { thought: '', tool: tool as never, args: tool === 'record_yes' ? { party: HARPER, slot: 283 } : { why: 'x' } }, context: snapshot(ctx), refused: false, shadowed: [] });
    expect(gradeRun(sc, ev, st, { ...result([rec('record_yes')]), condition: 'A0' }).outcome).toMatchObject({ firstStepMatch: true, classMatch: true });
    expect(gradeRun(sc, ev, st, result([rec('record_yes')])).outcome).toMatchObject({ firstStepMatch: null, classMatch: false });
  });
});

describe('condition A end to end (scripted)', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('runs s01 to completion: the JSONL line has B\'s fields, the raw calls beside the mapped ones, and nothing reached a sink', async () => {
    const fetchSpy = vi.fn(async () => { throw new Error('no network in the bench'); });
    vi.stubGlobal('fetch', fetchSpy);
    const sc = loadScenario('s01-dst-crossing');
    const model = scripted([
      act('calendar_list_events', { from: '2026-11-03', to: '2026-11-03' }),
      act('calendar_create_event', { start: '2026-11-03T12:00', end: '2026-11-03T12:30', title: 'Intro call', attendees: [DANA, 'bob@example.com'] }),
      act('mail_send', { to: [DANA], cc: ['bob@example.com'], subject: 'Re: Intro call', body: 'Tuesday Nov 3 at noon Eastern (10am Phoenix) it is; the invite follows.', times: ['2026-11-03T12:00'] }),
      act('bob_message', { text: 'Dana took Tuesday at noon; the booking is behind a card for your tap.' }),
      act('done', { state: 'closed', why: 'booked, waiting on Bob\'s approval' }),
    ]);
    const a = await runOne(sc, 0, 'A', model, 'scripted', 1);
    const b = await runOne(sc, 0, 'B', scripted([act('wait', { why: 'x' })]), 'scripted', 1);
    expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());
    expect(a).toMatchObject({ condition: 'A', outcome: 'ended', harness: { stepCap: RAW_CAP } });
    expect(a.steps).toHaveLength(5);
    expect(Object.keys(a.steps[0]!).sort()).toEqual(Object.keys(b.steps[0]!).sort());
    expect(a.steps[0]!.prompt).toMatch(/TOOLS \(an MCP tools\/list/);
    expect(a.steps[4]!.prompt).toMatch(/Step 4: you called bob_message/);
    // The confirmation mail after the booking restates the booked time: an ask that names the event, not a proposal.
    expect(a.actions.map((x) => [x.raw?.tool, x.tool])).toEqual([['calendar_list_events', 'check_calendar'], ['calendar_create_event', 'book'], ['mail_send', 'ask'], ['bob_message', 'tell_bob'], ['done', 'wait']]);
    expect(a.actions[2]!.args).toMatchObject({ confirms: 'raw-evt-1-1', restates: ['2026-11-03T17:00:00.000Z'] });
    expect(a.steps[1]!.result).toMatch(/raw-evt-1-1/);
    expect(a.graders.outcome).toMatchObject({ expected: 'book', actual: 'book', match: true, slotMatch: true, tellBobMatch: true, firstStepMatch: null });
    for (const k of ['V1', 'V2', 'V4', 'V5', 'V8', 'V9', 'NF'] as const) expect(a.graders[k].fired, k).toBe(false);
    // Every write is on the record, and held: nothing went to a network, a mailbox, a calendar or Bob.
    expect((a.would as Array<{ tool: string }>).map((w) => w.tool)).toEqual(['calendar_create_event', 'mail_send', 'bob_message']);
    expect(a.steps[1]!.result).toMatch(/held for Bob's approval/);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(a.costUsd).toBe(0);
  });

  it('hitting the cap is the capped outcome, graded V9', async () => {
    const sc = loadScenario('s01-dst-crossing');
    const lines = await runScenario(sc, 'A', scripted([act('calendar_list_events', { from: '2026-11-02', to: '2026-11-06' }), act('mail_read_thread', {})]), 'scripted', 1);
    expect(lines[0]).toMatchObject({ outcome: 'capped' });
    expect(lines[0]!.steps).toHaveLength(RAW_CAP);
    expect(lines[0]!.graders.V9.fired).toBe(true);
  });

  it('link_fetch finds the link on record however the model writes it (plan-39: "calendly.com/emeryashby")', async () => {
    const sc = loadScenario('plan-39');
    const r = await runRawCondition(sc, 0, scripted([
      act('link_fetch', { url: 'calendly.com/emeryashby', from: '2026-10-12', to: '2026-10-16' }),
      act('link_fetch', { url: 'https://www.Calendly.com/emeryashby/', from: '2026-10-12', to: '2026-10-16' }),
      act('done', { state: 'waiting', why: 'x' }),
    ]), 'scripted');
    for (const s of r.steps.slice(0, 2)) { expect(s.result).not.toMatch(/404/); expect(s.result).toMatch(/"slots"/); }
  });

  it('s10 e0 scripted: the same three starts re-offered after Bob changed the meeting are a proposal', async () => {
    const sc = loadScenario('s10-goal-change');
    const lines = await runScenario(sc, 'A', scripted([
      act('calendar_list_events', { from: '2026-11-16', to: '2026-11-20' }),
      act('mail_send', { to: ['quinn.ashdown@cobalt.example.net'], subject: 'Re: visit', body: 'Bob would like a 30-minute call instead. Mon Nov 16 12:15, Tue Nov 17 3:30 or Thu Nov 19 2:15?', times: ['2026-11-16T12:15', '2026-11-17T15:30', '2026-11-19T14:15'] }),
      act('done', { state: 'waiting', why: 'x' }),
      act('done', { state: 'waiting', why: 'x' }),
    ]), 'scripted', 1);
    expect(lines[0]!.actions.map((a) => a.tool)).toEqual(['check_calendar', 'propose', 'wait']);
    expect(lines[0]!.graders.outcome).toMatchObject({ actual: 'propose', match: true });
  });

  it('two unreadable answers in a row end the run stuck', async () => {
    const sc = loadScenario('s01-dst-crossing');
    const r = await runRawCondition(sc, 0, scripted(['I would book Tuesday.', '{"tool": "book"}']), 'scripted');
    expect(r.outcome).toBe('stuck');
    expect(r.actions).toHaveLength(0);
    expect(r.steps.map((s) => s.unreadable)).toEqual(['no "{" in the answer', expect.stringMatching(/unknown tool/)]);
  });

  it('carries what it created to the next event: her mail on the thread, the persona answers her own times', async () => {
    const sc = loadScenario('accept-first');
    const model = scripted([
      act('calendar_list_events', { from: '2026-10-13', to: '2026-10-17' }),
      act('mail_send', { to: [HARPER], subject: 'Intro call', body: 'Would Wednesday Oct 14 at 10:00 am or Thursday Oct 15 at 3:00 pm suit?', times: ['2026-10-14T10:00', '2026-10-15T15:00'] }),
      act('done', { state: 'waiting', why: 'waiting on Harper' }),
      act('done', { state: 'waiting', why: 'x' }),
    ]);
    const lines = await runScenario(sc, 'A', model, 'scripted', 1);
    expect(lines[0]!.graders.outcome).toMatchObject({ actual: 'propose', match: true });
    expect(lines[1]!.sequence.carriedFrom).toBe('run');
    const p = lines[1]!.steps[0]!.prompt;
    expect(p).toMatch(/From: Winnie <winnie@agent.example.com>[\s\S]*Would Wednesday Oct 14/);
    expect(p).toMatch(/Wednesday at 10:00 am works for me/);
  });
});
