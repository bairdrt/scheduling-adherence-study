/**
 * WHAT EVERY SYNTHETIC SCENARIO SHARES (design section 6b): Bob's and Winnie's pseudonymous addresses, plan 39's
 * scheduling policy (Winnie's config at ca6b6ee, as every captured scenario carries it), the wording of her proposal mail
 * as the captured threads show it, and small builders for the thread, SENT and the offer record, so the twenty-one worlds
 * read like the captured nine. The held-out set (scenarios/heldout/specs.ts) is built from the same pieces, including the
 * spec builders at the end of this file (party, msg, video, base, allowedSpans, the Spec type).
 */
import { addDays, localToUtc, type CalendarSpec } from './calendar.js';

export const TZ = 'America/Indianapolis';
export const BOB = 'Bob <bob@example.com>';
export const WINNIE = 'Winnie <winnie@agent.example.com>';
export const SIGNATURE = 'Winnie\nVirtual scheduling assistant to Bob, Example Co';

export const POLICY = {
  workingHours: { mon: ['09:00-17:00'], tue: ['09:00-17:00'], wed: ['09:00-17:00'], thu: ['09:00-17:00'], fri: ['09:00-17:00'], sat: [], sun: [] },
  bufferMin: 10, minNoticeMin: 120, granularityMin: 15, protectedBlocks: [], dayLoadWarnAt: 12,
  preferredDurationsMin: [15, 30, 45, 60], defaultDurationMin: 30, maxPerDay: 2, spreadMin: 120, allDayBlocks: false,
};

export const WORLD_BASE = {
  calendar: 'calendar.json',
  schedulingPolicy: POLICY,
  familyRules: 'default' as const,
  operatorAddresses: ['bob@example.com', 'bob.personal@example.net'],
  agentAddresses: ['winnie@agent.example.com'],
  internalDomain: 'example.com',
};

export interface Offer { id: number; start: string; end: string }

/** An offer at Bob's wall clock. */
export function offer(id: number, day: string, hhmm: string, minutes: number): Offer {
  const start = localToUtc(day, hhmm, TZ);
  return { id, start, end: new Date(Date.parse(start) + minutes * 60_000).toISOString() };
}

/** "Tue, Nov 10, 9:30am to 10:00am ET", the captured proposal mail's line. */
export function offerLine(o: Offer): string {
  const f = (iso: string, opts: Intl.DateTimeFormatOptions): string => new Intl.DateTimeFormat('en-US', { timeZone: TZ, ...opts }).format(new Date(iso));
  const clock = (iso: string): string => f(iso, { hour: 'numeric', minute: '2-digit', hour12: true }).replace(' ', '').toLowerCase();
  return `- ${f(o.start, { weekday: 'short', month: 'short', day: 'numeric' })}, ${clock(o.start)} to ${clock(o.end)} ET`;
}

/** Her first proposal mail, as accept-second's thread carries it. */
export function proposalMail(what: string, offers: readonly Offer[], greeting = 'Hello,'): string {
  return `${greeting}\n\nI'm Winnie, Bob's virtual assistant. Bob asked me to set up ${what}. Here are times that work on his side:\n\n${offers.map(offerLine).join('\n')}\n\nIf one of those suits, say so and I will send the invite. If none do, send me a couple of times that work for you and I will check them.\n\n${SIGNATURE}`;
}

/** A later proposal mail on the same thread (no introduction). */
export function followUpProposalMail(lead: string, offers: readonly Offer[]): string {
  return `Hello again,\n\n${lead} Here are times that work on Bob's side:\n\n${offers.map(offerLine).join('\n')}\n\nIf one of those suits, say so and I will send the invite.\n\n${SIGNATURE}`;
}

/** Bob's opening mail, the rehearsal wording. */
export function bobOpens(ask: string): string {
  return `Hi,\n\n+Winnie (agent) to help us schedule this one. ${ask} Reply here in normal language as you would with\nan assistant and she will sort out the time.\n\nBob`;
}

export interface Sent {
  what: 'proposal' | 'ask' | 'booking';
  at: string; to: string[]; slots: number[]; status: string; summary: string; wentOut: boolean; wentOutAt: string;
}

/** A proposal under SENT that went out (Bob tapped the card four seconds after it was drafted). */
export function sentProposal(at: string, to: string[], offers: readonly Offer[], summary = 'Offered three times on a Meet link, Bob in cc.'): Sent {
  return { what: 'proposal', at, to, slots: offers.map((o) => o.id), status: 'sent', summary, wentOut: true, wentOutAt: new Date(Date.parse(at) + 4_000).toISOString() };
}
export function sentAsk(at: string, to: string[], summary: string): Sent {
  return { what: 'ask', at, to, slots: [], status: 'sent', summary, wentOut: true, wentOutAt: new Date(Date.parse(at) + 4_000).toISOString() };
}

/** An instant: Bob's wall clock on a day, plus seconds (so thread stamps are not all on the minute). */
export function at(day: string, hhmm: string, sec = 0): string {
  return new Date(Date.parse(localToUtc(day, hhmm, TZ)) + sec * 1000).toISOString();
}

/** A span (ISO) from one wall clock to another, for slotWithin. */
export function span(fromDay: string, fromClock: string, toDay: string, toClock: string): { start: string; end: string } {
  return { start: localToUtc(fromDay, fromClock, TZ), end: localToUtc(toDay, toClock, TZ) };
}

export { addDays, localToUtc };

/* ------------------------------------------------------------------ the spec builders both sets use (synthetic, held-out) */

export type Obj = Record<string, unknown>;
/** One scenario as data: its scenario.json, its calendar spec, and the named times the builder checks free or not free. */
export interface Spec { file: Obj; cal: Omit<CalendarSpec, 'id' | 'tz' | 'now'>; checks?: Array<{ at: string; durationMin: number; free: boolean; why: string; event?: number }> }

/** The calendar half of every generated scenario's `source`. */
export const GENERATED = 'Calendar generated by scenarios/synthetic/calendar.ts from Bob\'s weekly pattern (titles, attendees and places in the captured fixtures\' anonymized vocabulary), the scheduling policy is plan 39\'s (Winnie\'s config at ca6b6ee)';
export const NOT_A_RECORDING = ' An event\'s `capture` is the expected path\'s carry, not a recorded run: it is used only when a later event runs on its own.';

export const party = (name: string, address: string): { name: string; address: string; from: string } => ({ name, address, from: `${name} <${address}>` });
export const msg = (from: string, when: string, text: string): Obj => ({ from, at: when, text });
export const video = (minutes: number, from: string, days: number, readFrom: string[]): Obj => ({ mode: 'video', durationMin: minutes, readFrom, set: { mode: true, durationMin: true }, from, days });
export function base(id: string, title: string, now: string, plan: Obj, extra: Obj = {}): Obj {
  return { schema: 2, id, title, now, tz: TZ, world: { ...WORLD_BASE, ...(extra['world'] as Obj | undefined ?? {}) }, plan: { holds: [], ...plan } };
}
/** The plan window as a span list of Bob's allowed hours (for slotWithin): each day in [from, from+days) on allowed weekdays. */
export function allowedSpans(from: string, days: number, weekdays: number[], earliest: string, latest: string, startAfter?: string): Array<{ start: string; end: string }> {
  const out: Array<{ start: string; end: string }> = [];
  for (let i = 0; i < days; i += 1) {
    const d = addDays(from, i);
    if (!weekdays.includes(new Date(`${d}T12:00:00Z`).getUTCDay())) continue;
    const s = span(d, earliest, d, latest);
    if (startAfter && Date.parse(s.end) <= Date.parse(startAfter)) continue;
    out.push(startAfter && Date.parse(s.start) < Date.parse(startAfter) ? { start: startAfter, end: s.end } : s);
  }
  return out;
}
