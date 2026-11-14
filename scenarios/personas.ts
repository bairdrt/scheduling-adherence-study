/**
 * THE COUNTERPARTY PERSONAS' WORDS, as Winnie's live harness composes them (winnie tools/harness/personas.ts replyFor,
 * read 2026-11-05; re-implemented here, not vendored: the harness driver is not part of the published slice). A persona
 * composes ONE reply from the offers she actually made, in Bob's zone, so a multi-event scenario's reply names a time
 * the model under test offered, exactly as the live rehearsals did. `chose` is the offer the words point at (the
 * expectation's slot when `slotFrom` is "persona").
 *
 * Only the personas whose words depend on her offers matter here; the fixed-text ones are carried for completeness.
 * windows and silent are not composed: windows names days Bob is free on (the driver searched his calendar), so a
 * windows scenario carries its captured words; silent says nothing.
 */
import type { OfferedTime } from './load.js';

export type Persona = 'accept-first' | 'accept-second' | 'accept-by-model' | 'decline' | 'counter-another-day' | 'central-time' | 'refuse-offered';
export const PERSONAS: readonly Persona[] = ['accept-first', 'accept-second', 'accept-by-model', 'decline', 'counter-another-day', 'central-time', 'refuse-offered'];

export function wordsFor(ms: number, tz: string): { weekday: string; clock: string; date: string } {
  const d = new Date(ms);
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long' }).format(d);
  const clock = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true }).format(d).toLowerCase();
  const date = new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'long', day: 'numeric' }).format(d);
  return { weekday, clock, date };
}

const DAY_MS = 86_400_000;

/** The next weekday strictly after the latest offer, as words (personas.ts counterDayAfter). */
function counterDayAfter(offers: readonly OfferedTime[], tz: string): { weekday: string; date: string } {
  let t = Math.max(...offers.map((o) => Date.parse(o.start))) + DAY_MS;
  for (let i = 0; i < 7; i += 1) {
    const w = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(new Date(t));
    if (w !== 'Sat' && w !== 'Sun') break;
    t += DAY_MS;
  }
  const { weekday, date } = wordsFor(t, tz);
  return { weekday, date };
}

/** The persona's reply to `offers` (her latest proposal to them, any order), and the offer it chose, if it chose one. */
export function personaReply(persona: Persona, offers: readonly OfferedTime[], tz: string): { text: string; chose?: OfferedTime } {
  const sorted = [...offers].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const pick = (i: number): OfferedTime => {
    const o = sorted[i];
    if (!o) throw new Error(`persona ${persona} needs ${i + 1} offer(s) to reply to; she made ${sorted.length}`);
    return o;
  };
  switch (persona) {
    case 'accept-first': { const o = pick(0); const w = wordsFor(Date.parse(o.start), tz); return { text: `${w.weekday} at ${w.clock} works for me. Thanks for sorting this out.`, chose: o }; }
    case 'accept-second': { const o = pick(1); const w = wordsFor(Date.parse(o.start), tz); return { text: `Let's go with ${w.weekday} at ${w.clock}. See you then.`, chose: o }; }
    case 'accept-by-model': {
      const o = pick(1);
      const w = wordsFor(Date.parse(o.start), tz);
      const sameDay = sorted.filter((x) => wordsFor(Date.parse(x.start), tz).weekday === w.weekday);
      if (sameDay.length === 1) return { text: `The ${w.weekday} option is the one for me.`, chose: o };
      const at = sameDay.indexOf(o);
      const order = at === 0 ? 'earlier' : at === sameDay.length - 1 ? 'later' : 'middle';
      return { text: `The ${order} ${w.weekday} option is the one for me.`, chose: o };
    }
    case 'decline':
      return { text: "Thanks for the options, but this doesn't work for me right now. Let's leave it for the moment and I will come back to you." };
    case 'counter-another-day': {
      if (sorted.length === 0) pick(0);
      const c = counterDayAfter(sorted, tz);
      return { text: `I'm tied up at each of those, unfortunately. ${c.weekday} ${c.date} at 10:00 am would be good on my side.` };
    }
    case 'central-time': {
      const o = pick(0);
      const w = wordsFor(Date.parse(o.start) - 3_600_000, tz); // one hour earlier on the clock = the same instant in Central
      return { text: `${w.clock} Central on ${w.weekday} works for me.`, chose: o };
    }
    case 'refuse-offered': {
      const o = pick(0);
      const w = wordsFor(Date.parse(o.start), tz);
      return { text: `${w.weekday} at ${w.clock} won't work, sorry. Any chance of something later in the week?`, chose: o };
    }
  }
}
