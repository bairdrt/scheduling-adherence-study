import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadScenario, resolveEvent, scenarioIds, validateScenario } from '../scenarios/load.js';
import { buildWorld } from '../conditions/world.js';

describe('the scenario loader', () => {
  const sc = loadScenario('plan-39');
  const raw = JSON.parse(fs.readFileSync(path.join(sc.dir, 'scenario.json'), 'utf8')) as Record<string, unknown>;

  it('loads plan 39 with its calendar and Calendly captures', () => {
    expect(sc.now).toBe('2026-10-10T16:30:00.000Z');
    expect(sc.tz).toBe('America/Indianapolis');
    expect(sc.plan.parties).toHaveLength(2);
    expect(sc.calendar.events.length).toBeGreaterThan(100);
    expect(sc.calendar.syncStatus.map((s) => s.windowEnd)).toEqual(Array(3).fill('2026-10-24T16:15:00.000Z'));
    expect(sc.calendly).toBeDefined();
    expect(sc.events[0]!.expect.decisionClass).toBe('propose');
    expect(sc.fileSchema).toBe(1);
  });

  it.each(scenarioIds())('%s carries no real names or addresses: titles are generic, every address is at an example domain', (id) => {
    const s = loadScenario(id);
    for (const e of s.calendar.events) {
      expect(e.title).toMatch(/^(Meeting|Block|Personal|Family event|Family practice) \d+( - (dad|mom))?$/);
      for (const a of e.attendees) expect(a.email).toMatch(/@(example\.com|example\.net|external\.example)$/);
    }
    const text = fs.readFileSync(path.join(s.dir, 'scenario.json'), 'utf8');
    for (const m of text.match(/[\w.+-]+@[\w.-]+/g) ?? []) expect(m).toMatch(/@([\w-]+\.)?example\.(com|net|org)$/);
    expect(text).not.toMatch(/audiochuck|baird|SELF-TEST|test-vendor|test-peer/i);
  });

  it.each(scenarioIds())('%s resolves every event, and every slot she offered is free in its world', async (id) => {
    const s = loadScenario(id);
    for (let k = 0; k < s.events.length; k += 1) {
      const ev = resolveEvent(s, k);
      expect(ev.thread.every((m) => m.text.length > 0)).toBe(true);
      if (ev.expect.slotFrom) expect(ev.expect.slotStarts?.length).toBe(1);
    }
    const offered = [...(s.initial.offered ?? []), ...s.events.flatMap((e) => e.capture?.offered ?? [])];
    const w = buildWorld(s);
    await Promise.all(offered.map(async (o) => {
      const local = new Intl.DateTimeFormat('sv-SE', { timeZone: s.tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(o.start)).replace(' ', 'T');
      const r = await w.lookups.checkCalendar({ times: [local], durationMin: (Date.parse(o.end) - Date.parse(o.start)) / 60_000 });
      expect(r.slots[0]?.free).toBe(true);
    })).finally(() => w.close());
  });

  it('refuses a malformed scenario, naming the field', () => {
    expect(() => validateScenario({ ...raw, now: 'yesterday' })).toThrow(/"now"/);
    expect(() => validateScenario({ ...raw, events: [] })).toThrow(/"events"/);
    const ev = (raw['events'] as Array<Record<string, unknown>>)[0]!;
    expect(() => validateScenario({ ...raw, events: [{ ...ev, expect: { ...(ev['expect'] as object), mustReach: ['nobody@example.com'] } }] })).toThrow(/not a party/);
    const v2 = JSON.parse(fs.readFileSync(path.join(loadScenario('accept-first').dir, 'scenario.json'), 'utf8')) as Record<string, unknown>;
    const evs = v2['events'] as Array<Record<string, unknown>>;
    expect(() => validateScenario({ ...v2, initial: undefined })).toThrow(/"initial"/);
    expect(() => validateScenario({ ...v2, events: [evs[0], { ...evs[1], now: '2026-10-01T00:00:00Z' }] })).toThrow(/before the event it follows/);
    expect(() => validateScenario({ ...v2, events: [evs[0], { ...evs[1], expect: { ...(evs[1]!['expect'] as object), alsoAccept: ['ask_bob'], notes: undefined } }] })).toThrow(/alsoAccept needs notes/);
  });
});
