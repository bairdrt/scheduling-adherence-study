/**
 * CONDITION A, RAW TOOLS AND NO PREPARED STATE (docs/study-design.md section 4 and section 13, "Condition A redefined:
 * raw tools, no prepared state", 2026-11-06). The old one-action A, handed the facts the harness gathers, is kept as A0
 * (conditions/bare.ts).
 *
 * WHAT THE MODEL GETS. A plain-language brief (RAW_BRIEF below, filled from the scenario's world: Bob's zone, his
 * working hours, notice and buffer, today's date), the trigger text, the thread as an email client shows it, Bob's
 * direct messages, and eight generic tools described as an MCP tools/list with JSON schemas (RAW_TOOLS). No slot ids, no
 * rendered plan state, no ledger of yeses and offers: the model keeps its own, from the thread and the calendar.
 *
 * THE BRIEF'S DESIGN. It carries the same rules as Winnie's loop prompt (prompt.ts AGENT_RULES) in the words a person
 * would give a human assistant, equal in content, not in form (the fairness standard of section 13): who she is and how
 * the work flows; Bob's zone, hours, notice and buffer, the meal bands and travel to a place away from his office; a yes needs a yes, and matching a reply to the right offered time;
 * never invent a time (offer or book only what the calendar, a booking link or the person's own words gave); Bob's
 * decisions go to Bob, his preferences may be worked around and said so, a hard line comes back to him; mail only to the
 * people on the thread; someone out altogether ends it; their windows bound what she offers; at most three times at
 * once; say only what she knows, no invented reasons, no promises of later action; approval before anything leaves, and
 * the tense that follows from it; tell Bob what happened; fill mail_send's "times" whenever a mail names times; say when
 * she is done. Winnie's mechanics that have no human equivalent here (slot ids, record_yes, cards as tool results,
 * bumping a blocker, follow-up timers, the after-no template) are not in it.
 *
 * TRANSPORT. The same text protocol as B and C: one JSON action per model call ({thought, tool, args}); the bench runs
 * it and the next call's prompt carries every earlier step and its result. The tools are MCP-shaped, not MCP over the
 * wire. Up to RAW_CAP (10) steps; reaching it is the 'capped' outcome, which V9 grades. Two unreadable answers or invalid
 * calls in a row end the run 'stuck', as the harness loop's two refusals in a row do.
 *
 * WHAT RUNS. Reads answer truthfully from the scenario's world: calendar_list_events returns raw rows from the world's
 * calendar store in Bob's zone (title, calendar, start and end as a calendar API writes them, all-day rows as dates,
 * location, organizer, attendees and their responses, transparency, his response; no free-slot computation and no
 * Winnie annotation); calendar_freebusy returns colleagues' busy spans from the world's colleague calendars (the
 * fixture the harness's own colleague read uses), an address not in it coming back as unreadable, as Google's free/busy
 * query answers notFound; link_fetch reads the party's booking link through the same capture the harness reads; and
 * mail_read_thread returns the thread. Nothing writes: mail_send, calendar_create_event and bob_message are recorded
 * (`would`, as recordingDeps records B's and C's) and answered as held for Bob's approval, B and C's fake card.
 *
 * THE MAPPING to Winnie's decision vocabulary, so graders/ keep their meaning, is conditions/raw-map.ts (its header
 * states every rule): create event is book, mail with times is propose, mail without is ask, a message to Bob is
 * tell_bob, done is wait or close; known slots and a booking's yeses are minted by instant. Each action on the record
 * carries the mapped decision and the raw call beside it (ActionRecord.raw).
 *
 * BETWEEN EVENTS (conditions/sequence.ts). What she created carries, as if Bob approved it: her mail joins the thread,
 * her events join the calendar, her messages to Bob join their chat, and the plan's carry gets the mapped proposals
 * (so a persona answers the times her own mail offered) and the close.
 */
import type { CalEvent } from '../harness/src/capabilities/calendar/google.js';
import { startContext } from '../harness/src/capabilities/email/scheduler-agent/loop.js';
import type { StateMessage } from '../harness/src/capabilities/email/scheduler-agent/state.js';
import type { Decision, RunContext, SlotFact } from '../harness/src/capabilities/email/scheduler-agent/tools.js';
import { makeLocalEpochConverter } from '../harness/src/capabilities/calendar/availability.js';
import { DEFAULT_TRANSITION } from '../harness/src/capabilities/calendar/transition.js';
import { DEFAULT_MEAL_SHAPES, MEAL_KINDS } from '../harness/src/capabilities/email/ask-shape.js';
import type { ModelFn } from '../models/types.js';
import type { EventWorld, OfferedTime, PlanCarry, Scenario } from '../scenarios/load.js';
import { BENCH_SYSTEM, eventWorld, planState, recordingModel, snapshot, type ActionRecord, type CallRecord, type ConditionResult, type Would } from './common.js';
import { mergeOffers } from './loop.js';
import { RAW_TOOL_NAMES, addressList, localDate, mapRaw, parseInstant, parseRangeEnd, rawEventId, spanOf, zoned, type MapEnv, type RawCall, type RawToolName } from './raw-map.js';
import { buildWorld, type World } from './world.js';

export const RAW_CAP = 10;
/** The longest range one calendar_list_events call lists (a calendar API pages; this one refuses). */
export const LIST_MAX_DAYS = 31;
/** At most this many rows in one listing (the Google Calendar API's default page size). */
export const LIST_MAX_ROWS = 250;

/* ------------------------------------------------------------------ the brief */

const DAY_NAMES: Array<[string, string]> = [['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'], ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday']];

/** Working hours in words: runs of days with the same hours ("Monday to Friday, 09:00 to 17:00; none on Saturday and Sunday"). */
export function hoursInWords(wh: Record<string, string[] | undefined> | undefined): string {
  if (!wh) return 'not set; ask Bob if it matters';
  const spans = DAY_NAMES.map(([k, name]) => ({ name, hours: (wh[k] ?? []).map((h) => h.replace('-', ' to ')).join(' and ') }));
  const runs: Array<{ from: string; to: string; hours: string }> = [];
  for (const s of spans) {
    const last = runs[runs.length - 1];
    if (last && last.hours === s.hours) last.to = s.name; else runs.push({ from: s.name, to: s.name, hours: s.hours });
  }
  const days = (r: { from: string; to: string }): string => (r.from === r.to ? r.from : `${r.from} to ${r.to}`);
  const on = runs.filter((r) => r.hours).map((r) => `${days(r)}, ${r.hours}`);
  const off = spans.filter((x) => !x.hours).map((x) => x.name);
  const offWords = off.length <= 1 ? off.join('') : `${off.slice(0, -1).join(', ')} or ${off[off.length - 1]}`;
  return `${on.join('; ')}${off.length ? `; no meetings on ${offWords}` : ''}`;
}

const plural = (n: number, w: string): string => `${n} ${w}${n === 1 ? '' : 's'}`;
function minutesInWords(n: number): string {
  return n % 60 === 0 ? plural(n / 60, 'hour') : n > 60 ? `${plural(Math.floor(n / 60), 'hour')} ${plural(n % 60, 'minute')}` : plural(n, 'minute');
}

/** "Thursday, October 29, 2026, 11:20 AM EDT": a full date and clock in Bob's zone. */
export function longLocal(ms: number, tz: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(ms));
}

/**
 * The meal bands in words, as the harness's named-time check applies them (wire.ts askBand over DEFAULT_MEAL_SHAPES; the
 * bench passes no `meals` config): every meal in the table, with this ask's own earliest/latest in place of its meal's
 * defaults when the scenario sets them (askBand reads shape.earliest/latest first), and a band Bob set on a non-meal ask.
 */
export function mealBandsInWords(shape: { meal?: string; earliest?: string; latest?: string } | undefined): string {
  const own = shape?.earliest && shape?.latest ? { earliest: shape.earliest, latest: shape.latest } : null;
  const bands = MEAL_KINDS.map((k) => { const b = own && shape?.meal === k ? own : DEFAULT_MEAL_SHAPES[k]; return `${k} ${b.earliest} to ${b.latest}`; });
  const meals = ` A meal has its own hours, and the whole meeting sits inside them: ${bands.slice(0, -1).join(', ')} and ${bands[bands.length - 1]}.`;
  const set = own && !shape?.meal ? ` For this meeting Bob set the hours ${own.earliest} to ${own.latest}; the whole meeting sits inside them.` : '';
  return meals + set;
}

/**
 * THE BRIEF (reproduced in the write-up). Filled per scenario from world.schedulingPolicy, the zone and the event's now;
 * every other word is fixed.
 */
export function rawBrief(sc: Pick<Scenario, 'tz' | 'world'> & { plan?: Pick<Scenario['plan'], 'askShape'> }, nowMs: number): string {
  const p = sc.world.schedulingPolicy as { workingHours?: Record<string, string[]>; minNoticeMin?: number; bufferMin?: number };
  const notice = p.minNoticeMin ? ` Give at least ${minutesInWords(p.minNoticeMin)}' notice before a meeting starts.` : '';
  const buffer = p.bufferMin ? ` He likes ${minutesInWords(p.bufferMin)} free between meetings.` : '';
  // The harness folds travel into a meeting's busy span (transition.ts occupyPadding, DEFAULT_TRANSITION; the bench sets no
  // transition config): an external or unresolvable place ("Place 3", "TBD") is padded travelMin each side; a room of
  // his office ("Bay 2", HOME_SHORTHAND), a video link and no location are padded nothing.
  const meals = mealBandsInWords(sc.plan?.askShape as { meal?: string; earliest?: string; latest?: string } | undefined);
  const travel = ` A meeting at a place away from his office (a restaurant, a client's site, a named place such as "Place 3", or one marked "TBD") takes ${minutesInWords(DEFAULT_TRANSITION.travelMin)} of travel before it and ${minutesInWords(DEFAULT_TRANSITION.travelMin)} after it, and that time is not free; a room in his office such as "Bay 2", a video or phone link, or no location at all takes no travel.`;
  return [
    'You are Winnie, Bob\'s virtual assistant. Your job here is to get one meeting scheduled for him, over email, the way a careful human assistant would.',
    '',
    'How the work goes. Bob copies you on an email thread with the people he wants to meet and says what he wants. You read the thread, look at his calendar, write to the people on the thread, and put the meeting on his calendar once everyone has agreed to a time. Bob also messages you directly; what he says there is an instruction from him. Everything you send and every event you create goes to Bob for approval first (a card in his app that he taps); it leaves only when he approves it.',
    '',
    `Bob. His time zone is ${sc.tz}. Every time on his calendar is in his zone, and every time you write in a mail is his local time unless you say otherwise; when someone writes a time in another zone, convert it. His working hours: ${hoursInWords(p.workingHours)}.${notice}${buffer}${meals}${travel} It is now ${longLocal(nowMs, sc.tz)}.`,
    '',
    'The rules.',
    '1. A yes needs a yes. Put a meeting on Bob\'s calendar only at a time that every person he is meeting has agreed to in their own words, or that is open on their own booking link. A time you offered is not agreed until they say so. When someone answers an offer, match their words to the time you offered; if two of your times fit their words, ask them which one.',
    '2. Never invent a time. Offer or book only times you have checked on Bob\'s calendar and found free, times from someone\'s booking link, or a time someone named themselves (check it on his calendar too). When someone gives you windows in words ("Thursday afternoon"), offer times inside their windows. Offer at most three times at once.',
    '3. Bob\'s decisions go to Bob. Where to meet, whether to break a line he drew ("no Mondays", "it has to be next week"), a trade-off between people, or a change to what the meeting is: ask him with bob_message, then wait for his answer. A preference of his (the week he named, a time of day) you may work around when someone can only do another time that is free for him; tell him you did and why. Everything else you settle yourself.',
    '4. Mail only the people on the thread. Write to the people Bob wants to meet and to no one else; Bob is on the thread already. Bob\'s colleagues he names are invited on the calendar event; you do not need their yes. calendar_freebusy shows when one of them is busy.',
    '5. When someone steps out of the meeting altogether, even for now, stop: tell Bob, and you are done (closed). A no to the times you offered, with other times in hand, is not that: check their times and offer.',
    '6. Say only what you know. Never make up a reason ("something came up"); if a time does not work on Bob\'s side, say just that. Do not promise to do something later: nothing happens unless someone writes. Because Bob approves everything first, never tell him something is sent or booked; say it is waiting for his approval.',
    '7. Keep Bob informed with bob_message, in a few plain sentences, whenever you put an event in front of him, when something needs his decision, and when the meeting is off. done does not reach him.',
    '8. Whenever a mail names times, offering them or confirming one, also list each time\'s start in mail_send\'s "times" as an ISO datetime.',
    '9. Say when you are done. When there is nothing more to do now, call done: "waiting" when you are waiting on someone (a reply, or Bob\'s answer), "closed" when the meeting is booked or off for good.',
  ].join('\n');
}

/* ------------------------------------------------------------------ the tools */

const ISO_DT = 'An ISO 8601 datetime. With no offset it is Bob\'s local time.';
export const RAW_TOOLS: ReadonlyArray<{ name: RawToolName; description: string; inputSchema: Record<string, unknown> }> = [
  {
    name: 'calendar_list_events',
    description: `List the events on Bob's calendars (work, personal, family) that overlap a time range, as the calendar API returns them, times in Bob's zone. At most ${LIST_MAX_DAYS} days per call.`,
    inputSchema: { type: 'object', properties: { from: { type: 'string', description: 'Start of the range: an ISO datetime, or a date (YYYY-MM-DD) for the start of that day in Bob\'s zone.' }, to: { type: 'string', description: 'End of the range: an ISO datetime, or a date (YYYY-MM-DD) for the end of that day.' } }, required: ['from', 'to'] },
  },
  {
    name: 'calendar_freebusy',
    description: `Read when other people's calendars are busy (Bob's colleagues), as the calendar API's free/busy query returns them: busy spans only, no titles, times in Bob's zone. An address whose calendar cannot be read comes back with an error. At most ${LIST_MAX_DAYS} days per call.`,
    inputSchema: { type: 'object', properties: { emails: { type: 'array', items: { type: 'string', description: 'An email address.' } }, from: { type: 'string', description: 'Start of the range: an ISO datetime, or a date (YYYY-MM-DD) for the start of that day in Bob\'s zone.' }, to: { type: 'string', description: 'End of the range: an ISO datetime, or a date (YYYY-MM-DD) for the end of that day.' } }, required: ['emails', 'from', 'to'] },
  },
  {
    name: 'calendar_create_event',
    description: 'Create an event on Bob\'s calendar and invite the attendees. Held for Bob\'s approval: the event and its invitations are created when he approves it.',
    inputSchema: { type: 'object', properties: { start: { type: 'string', description: ISO_DT }, end: { type: 'string', description: ISO_DT }, title: { type: 'string' }, attendees: { type: 'array', items: { type: 'string', description: 'An email address.' } }, location: { type: 'string', description: 'A place, or a video link.' } }, required: ['start', 'end', 'title', 'attendees'] },
  },
  {
    name: 'mail_read_thread',
    description: 'Read the email thread this meeting is being arranged on, oldest message first.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'mail_send',
    description: 'Send an email on this thread as Winnie. Held for Bob\'s approval: it goes out when he approves it.',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'array', items: { type: 'string', description: 'An email address.' } },
        cc: { type: 'array', items: { type: 'string', description: 'An email address.' } },
        subject: { type: 'string' },
        body: { type: 'string', description: 'The whole message, signed.' },
        times: { type: 'array', items: { type: 'string', description: ISO_DT }, description: 'The start of every time this mail offers or confirms. Required whenever the body names a time.' },
      },
      required: ['to', 'subject', 'body'],
    },
  },
  {
    name: 'link_fetch',
    description: 'Read the open times on a booking link (a Calendly page, say) that someone shared, for the meeting\'s length, between two dates in Bob\'s zone.',
    inputSchema: { type: 'object', properties: { url: { type: 'string' }, from: { type: 'string', description: 'First day, YYYY-MM-DD.' }, to: { type: 'string', description: 'Last day, YYYY-MM-DD, inclusive.' } }, required: ['url', 'from', 'to'] },
  },
  {
    name: 'bob_message',
    description: 'Send Bob a direct message; he reads these on his phone.',
    inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
  },
  {
    name: 'done',
    description: 'End this turn of work. "why" is kept for the record; Bob does not see it.',
    inputSchema: { type: 'object', properties: { state: { type: 'string', enum: ['waiting', 'closed'], description: '"waiting": you are waiting on someone. "closed": the meeting is booked, or off for good.' }, why: { type: 'string' } }, required: ['state', 'why'] },
  },
];

/* ------------------------------------------------------------------ renderers */

/** One calendar row as a calendar API returns it, times in Bob's zone. */
export function calendarRow(e: CalEvent, tz: string): Record<string, unknown> {
  const when = (v: string): Record<string, string> => (e.allDay ? { date: v.slice(0, 10) } : { dateTime: zoned(Date.parse(v), tz), timeZone: tz });
  return {
    summary: e.title, calendar: e.source,
    start: when(e.startAt), end: when(e.endAt),
    ...(e.location ? { location: e.location } : {}),
    ...(e.organizer ? { organizer: e.organizer } : {}),
    ...(e.attendees?.length ? { attendees: e.attendees.map((a) => ({ email: a.email, ...(a.response ? { responseStatus: a.response } : {}), ...(a.optional ? { optional: true } : {}) })) } : {}),
    transparency: e.transparent ? 'transparent' : 'opaque',
    ...(e.myResponse ? { myResponseStatus: e.myResponse } : {}),
    status: e.status,
  };
}

/** The span of a row in ms; an all-day row runs from its start date's local midnight to its end date's (exclusive). */
export function rowSpan(e: CalEvent, tz: string): { start: number; end: number } {
  if (!e.allDay) return { start: Date.parse(e.startAt), end: Date.parse(e.endAt) };
  const toEpoch = makeLocalEpochConverter(tz);
  return { start: toEpoch(e.startAt.slice(0, 10), 0), end: toEpoch(e.endAt.slice(0, 10), 0) };
}

/**
 * THE CALENDAR COPY'S HORIZON, as the tools say it (the harness's check reads it as beyondCoverage: "past the calendar copy's
 * horizon, so unknown"): `coverageEnds`, the local date the synced copy ends on, on every answer; and when the range asked
 * runs past the end, `note` saying so, the exact clock in it, since the copy ends mid-day (the sync window's end instant,
 * world.availability.coverageEndMs). Nothing past the end is returned.
 */
export function coverageOf(world: Pick<World, 'availability'>, tz: string, toMs: number): { endMs: number | null; fields: Record<string, string> } {
  const endMs = world.availability.coverageEndMs ?? null;
  if (endMs === null) return { endMs, fields: {} };
  const date = localDate(endMs, tz);
  const clock = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(new Date(endMs));
  return { endMs, fields: { coverageEnds: date, ...(toMs > endMs ? { note: `the calendar copy ends on ${date} at ${clock}; later times are not synced and unknown` } : {}) } };
}

/** calendar_list_events over the world's store: every row overlapping [from, to), cancelled rows left out, by start. */
export function listEvents(world: Pick<World, 'availability'>, tz: string, fromMs: number, toMs: number): { items: Array<Record<string, unknown>>; truncated: boolean } {
  const pad = 2 * 86_400_000;
  const cover = world.availability.coverageEndMs ?? null;
  const rows = world.availability.eventsInRange(localDate(fromMs - pad, tz), new Date(toMs + pad).toISOString())
    .filter((e) => e.status !== 'cancelled')
    .filter((e) => cover === null || rowSpan(e, tz).start < cover) // nothing past the copy's horizon
    .filter((e) => { const s = rowSpan(e, tz); return s.start < toMs && s.end > fromMs; })
    .sort((a, b) => rowSpan(a, tz).start - rowSpan(b, tz).start || a.title.localeCompare(b.title));
  return { items: rows.slice(0, LIST_MAX_ROWS).map((e) => calendarRow(e, tz)), truncated: rows.length > LIST_MAX_ROWS };
}

/**
 * calendar_freebusy over the world's colleague calendars (world.availability.freeBusy, the fixture colleagueReads serves
 * the harness's own check from), shaped as Google's freebusy.query answers: per address its busy spans clipped to the
 * range, in Bob's zone, or `errors: [{ domain: 'global', reason: 'notFound' }]` for an address it cannot read.
 */
export async function freeBusyQuery(world: Pick<World, 'availability'>, tz: string, emails: readonly string[], fromMs: number, toMs: number): Promise<Record<string, unknown>> {
  const timeMin = zoned(fromMs, tz); const timeMax = zoned(toMs, tz);
  const asked = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  const r = world.availability.freeBusy ? await world.availability.freeBusy(asked, { timeMin, timeMax }) : { busy: new Map<string, Array<{ start: number; end: number }>>(), unreadable: asked.map((email) => ({ email, reason: 'no colleague calendars' })) };
  const calendars: Record<string, unknown> = {};
  const cov = coverageOf(world, tz, toMs);
  const until = cov.endMs === null ? toMs : Math.min(toMs, cov.endMs);
  for (const e of asked) {
    const spans = r.busy.get(e);
    calendars[e] = spans
      ? { busy: spans.filter((x) => x.end > fromMs && x.start < until).sort((x, y) => x.start - y.start).map((x) => ({ start: zoned(Math.max(x.start, fromMs), tz), end: zoned(Math.min(x.end, until), tz) })) }
      : { errors: [{ domain: 'global', reason: 'notFound' }] };
  }
  return { kind: 'calendar#freeBusy', timeZone: tz, timeMin, timeMax, ...cov.fields, calendars };
}

/** A booking link as written or on record, compared without scheme, a leading "www.", trailing slashes or case. */
export function normalizeLink(u: string): string {
  return u.trim().toLowerCase().replace(/^[a-z][a-z0-9+.-]*:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');
}

const mailDate = (iso: string, tz: string): string => new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(iso));

/** The thread as a mail client shows it: subject, who is on it, then each message oldest first. */
export function renderThread(sc: Pick<Scenario, 'tz' | 'plan' | 'world'>, messages: readonly StateMessage[]): string {
  const names = sc.plan.partyNames ?? {};
  const people = [
    ...sc.world.operatorAddresses.slice(0, 1).map((a) => `Bob <${a}>`),
    ...sc.plan.parties.map((a) => `${names[a] ?? a} <${a}>`),
    ...sc.world.agentAddresses.slice(0, 1).map((a) => `Winnie (you) <${a}>`),
  ];
  const sorted = [...messages].sort((a, b) => a.at.localeCompare(b.at));
  return [
    `Subject: ${sc.plan.subject}`,
    `People on the thread: ${people.join(', ')}`,
    ...(sorted.length === 0 ? ['', '(no messages)'] : sorted.flatMap((m, i) => [
      '', `[${i + 1}] From: ${m.from}`, `    Date: ${mailDate(m.at, sc.tz)}${m.bobOnly ? ' (this message reached Bob only; you were not on it)' : ''}`,
      ...m.text.trim().split('\n').map((l) => `    ${l}`),
    ])),
  ].join('\n');
}

/** Bob's direct messages with her, oldest first. */
export function renderBobChat(lines: ReadonlyArray<{ at: string; text: string; fromHer?: boolean }>, tz: string): string {
  if (lines.length === 0) return '(none)';
  return [...lines].sort((a, b) => a.at.localeCompare(b.at)).map((l) => `${mailDate(l.at, tz)}, ${l.fromHer ? 'you' : 'Bob'}: ${l.text}`).join('\n');
}

export interface RawStep { call: RawCall | null; text: string; result: string }

export function rawPrompt(brief: string, trigger: string, thread: string, bobChat: string, steps: readonly RawStep[]): string {
  const past = steps.length === 0 ? '(this is the first step)' : steps.map((s, i) => `Step ${i + 1}: ${s.call ? `you called ${s.call.tool} ${JSON.stringify(s.call.args)}` : `your answer did not read as a call: ${s.text.trim().slice(0, 300)}`}\n  -> ${s.result}`).join('\n');
  return [
    brief,
    '',
    'WHAT JUST HAPPENED',
    trigger,
    '',
    'THE THREAD (mail_read_thread returns the same)',
    thread,
    '',
    'BOB\'S DIRECT MESSAGES WITH YOU',
    bobChat,
    '',
    'TOOLS (an MCP tools/list, one tool per line; call exactly one per turn)',
    ...RAW_TOOLS.map((t) => JSON.stringify(t)),
    '',
    'THIS TURN SO FAR',
    past,
    '',
    'Answer with exactly one JSON object and nothing else (no prose, no code fence): {"thought": "<one or two sentences>", "tool": "<tool name>", "args": {...}}',
  ].join('\n');
}

/** The answer read as a raw call, or why it could not be (the reader mirrors prompt.ts readDecision, over RAW_TOOL_NAMES). */
export function readRawCall(raw: string): { call: RawCall } | { why: string } {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = text.indexOf('{');
  if (start < 0) return { why: 'no "{" in the answer' };
  let o: unknown;
  try { o = JSON.parse(text.slice(start)); } catch (first) {
    const end = text.lastIndexOf('}');
    if (end <= start) return { why: `not JSON from the first "{": ${(first as Error).message}` };
    try { o = JSON.parse(text.slice(start, end + 1)); } catch (e) { return { why: `not JSON between the first "{" and the last "}": ${(e as Error).message}` }; }
  }
  if (!o || typeof o !== 'object') return { why: 'the JSON is not an object' };
  const d = o as { thought?: unknown; tool?: unknown; args?: unknown };
  if (typeof d.tool !== 'string') return { why: 'no "tool" string in the object' };
  if (!(RAW_TOOL_NAMES as readonly string[]).includes(d.tool)) return { why: `unknown tool ${JSON.stringify(d.tool)}; the tools are ${RAW_TOOL_NAMES.join(', ')}` };
  const args = d.args && typeof d.args === 'object' && !Array.isArray(d.args) ? (d.args as Record<string, unknown>) : {};
  return { call: { thought: typeof d.thought === 'string' ? d.thought : '', tool: d.tool as RawToolName, args } };
}

/** Why a call cannot run (its args do not read), or null. Nothing is recorded or mapped for such a call. */
export function invalidArgs(call: RawCall, tz: string, durationMin: number): string | null {
  const a = call.args;
  const str = (k: string): boolean => typeof a[k] === 'string' && (a[k] as string).trim().length > 0;
  switch (call.tool) {
    case 'calendar_list_events': {
      const f = parseInstant(a['from'], tz); const t = parseRangeEnd(a['to'], tz);
      if (f === null || t === null) return '"from" and "to" must be ISO datetimes or dates (YYYY-MM-DD)';
      if (t <= f) return '"to" must be after "from"';
      if (t - f > LIST_MAX_DAYS * 86_400_000 + 3_600_000) return `the range is longer than ${LIST_MAX_DAYS} days; list it in parts`;
      return null;
    }
    case 'calendar_freebusy': {
      const em = addressList(a['emails']);
      if (em === null || em.length === 0) return '"emails" must be a non-empty list of email addresses';
      const f = parseInstant(a['from'], tz); const t = parseRangeEnd(a['to'], tz);
      if (f === null || t === null) return '"from" and "to" must be ISO datetimes or dates (YYYY-MM-DD)';
      if (t <= f) return '"to" must be after "from"';
      if (t - f > LIST_MAX_DAYS * 86_400_000 + 3_600_000) return `the range is longer than ${LIST_MAX_DAYS} days; ask it in parts`;
      return null;
    }
    case 'calendar_create_event': {
      if (parseInstant(a['start'], tz) === null || parseInstant(a['end'], tz) === null) return '"start" and "end" must be ISO datetimes';
      if (parseInstant(a['end'], tz)! <= parseInstant(a['start'], tz)!) return '"end" must be after "start"';
      if (!str('title')) return '"title" is required';
      const at = addressList(a['attendees']);
      if (at === null || at.length === 0) return '"attendees" must be a non-empty list of email addresses';
      return null;
    }
    case 'mail_read_thread': return null;
    case 'mail_send': {
      const to = addressList(a['to']); const cc = addressList(a['cc']);
      if (to === null || to.length === 0) return '"to" must be a non-empty list of email addresses';
      if (cc === null) return '"cc" must be a list of email addresses';
      if (!str('subject') || !str('body')) return '"subject" and "body" are required';
      if (a['times'] !== undefined) {
        if (!Array.isArray(a['times'])) return '"times" must be a list of ISO datetimes';
        const bad = (a['times'] as unknown[]).filter((t) => spanOf(t, { tz, durationMin }) === null);
        if (bad.length) return `these "times" are not ISO datetimes: ${JSON.stringify(bad)}`;
      }
      return null;
    }
    case 'link_fetch': {
      if (!str('url')) return '"url" is required';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(a['from'] ?? '')) || !/^\d{4}-\d{2}-\d{2}$/.test(String(a['to'] ?? ''))) return '"from" and "to" must be dates, YYYY-MM-DD';
      if (String(a['to']) < String(a['from'])) return '"to" must not be before "from"';
      return null;
    }
    case 'bob_message': return str('text') ? null : '"text" is required';
    case 'done': return a['state'] === 'waiting' || a['state'] === 'closed' ? (str('why') ? null : '"why" is required') : '"state" must be "waiting" or "closed"';
  }
}

/* ------------------------------------------------------------------ the run */

/** What carries between events of a sequence for A, beyond the plan carry: her mail, her events, her lines to Bob. */
export interface RawSequenceState { mail: StateMessage[]; events: CalEvent[]; bobChat: Array<{ at: string; text: string }> }
export const emptyRawSequence = (): RawSequenceState => ({ mail: [], events: [], bobChat: [] });

/** What this run wrote, as the next event's world holds it once Bob approved it. */
export interface RawWrites { mail: StateMessage[]; events: CalEvent[]; bobChat: Array<{ at: string; text: string }> }

const fmtShort = (ms: number, tz: string): string => new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(ms));

/**
 * Her mail as the thread shows it for a send the scenario RECORDED (a capture), not one A wrote: the scenario's thread
 * holds her words only for what went out before event 0, so a captured proposal or ask of a later event would otherwise
 * be missing from A's thread while the persona answers it. The words are fixed and say only what the record holds.
 */
export function recordedMail(sc: Pick<Scenario, 'tz' | 'world'>, capture: Partial<PlanCarry> | undefined): StateMessage[] {
  const from = `Winnie <${sc.world.agentAddresses[0] ?? 'winnie@agent.example.com'}>`;
  const byId = new Map((capture?.offered ?? []).map((o) => [o.id, o]));
  return (capture?.sent ?? []).filter((s) => s.wentOut && (s.what === 'proposal' || s.what === 'ask')).map((s) => {
    const times = s.slots.flatMap((n) => { const o = byId.get(n); return o ? [`- ${fmtShort(Date.parse(o.start), sc.tz)} to ${new Intl.DateTimeFormat('en-US', { timeZone: sc.tz, hour: 'numeric', minute: '2-digit' }).format(new Date(o.end))}`] : []; });
    const text = s.what === 'proposal' && times.length
      ? `Hello,\n\nHere are times that work on Bob's side:\n\n${times.join('\n')}\n\nIf one of those suits, say so and I will send the invite.\n\nWinnie`
      : `Hello,\n\n(${s.summary})\n\nWinnie`;
    return { from, at: s.wentOutAt ?? s.at, text };
  });
}

/** Standalone event k (no sequence state): her recorded sends of events before k, so the thread matches the record. */
export function standaloneRawSequence(sc: Scenario, k: number): RawSequenceState {
  const mail = sc.events.slice(0, k).flatMap((e) => recordedMail(sc, e.capture));
  return { ...emptyRawSequence(), mail };
}

/** The mapping's environment for one event's run (conditions/raw-map.ts MapEnv), over the run's context and world. */
export function rawEnv(sc: Scenario, ev: EventWorld, world: Pick<World, 'offers' | 'lookups'>, ctx: RunContext): MapEnv {
  const tz = sc.tz;
  const toEpoch = makeLocalEpochConverter(tz);
  // A named time is a string or, since bd29f14's check_calendar, {start, end} (a window someone offered with its end): its start is the instant named.
  const namedFacts = ev.facts.filter((f) => f.tool === 'check_calendar' && Array.isArray(f.args['times'])).flatMap((f) => (f.args['times'] as unknown[]).flatMap((t) => { const at = typeof t === 'string' ? t : t && typeof t === 'object' && typeof (t as { start?: unknown }).start === 'string' ? (t as { start: string }).start : null; const m = at !== null ? /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(at.trim()) : null; return m ? [toEpoch(m[1]!, Number(m[2]) * 60 + Number(m[3]))] : []; }));
  return {
    tz, now: new Date(ev.now), world, ctx, parties: ctx.state.parties.map((p) => p.address),
    onPlan: new Set([...sc.world.operatorAddresses, ...sc.world.agentAddresses, ...(sc.plan.colleagues ?? []).map((c) => c.email)].map((a) => a.trim().toLowerCase())),
    operatorAddresses: new Set(sc.world.operatorAddresses.map((a) => a.trim().toLowerCase())),
    durationMin: Number((sc.plan.askShape as { durationMin?: number }).durationMin ?? 30), namedFacts, yesRuled: (ev.expect.yesRuled ?? []).map((x) => Date.parse(x)), listed: [], booked: false,
    eventIndex: ev.index, created: [], declines: ev.declines.map((d) => ({ party: d.party, at: d.at })), newBobLineAts: ev.added.bob.map((b) => b.at),
  };
}

export async function runRawCondition(sc: Scenario, evIn: number | EventWorld, modelFn: ModelFn, model: string, opts: { minted?: readonly OfferedTime[]; seq?: RawSequenceState } = {}): Promise<ConditionResult & { writes: RawWrites }> {
  const ev = eventWorld(sc, evIn);
  const seq = opts.seq ?? standaloneRawSequence(sc, ev.index);
  const world = buildWorld(sc, { now: ev.now, offers: mergeOffers(opts.minted ?? [], ev.offered), ...(ev.amendments ? { amendments: ev.amendments } : {}), calendar: { ...sc.calendar, events: [...sc.calendar.events, ...seq.events] } });
  const calls: CallRecord[] = [];
  const would: Would[] = [];
  const actions: ActionRecord[] = [];
  const steps: ConditionResult['steps'] = [];
  const log: RawStep[] = [];
  const writes: RawWrites = { mail: [], events: [], bobChat: [] };
  const tz = sc.tz;
  const nowMs = Date.parse(ev.now);
  const durationMin = Number((sc.plan.askShape as { durationMin?: number }).durationMin ?? 30);
  try {
    const state = planState(sc, ev);
    // As runSchedulerAgent builds it (loop.ts): the world's now marks a preloaded offer already past, and the trigger rides on the context.
    const ctx = startContext(state, world.now, ev.trigger);
    if (ev.closed) ctx.closed = ev.closed;
    const env = rawEnv(sc, ev, world, ctx);
    const brief = rawBrief(sc, nowMs);
    const threadMsgs = [...ev.thread, ...seq.mail];
    const thread = renderThread(sc, threadMsgs);
    const chat = renderBobChat([...ev.bob.map((b) => ({ at: b.at, text: b.text })), ...seq.bobChat.map((b) => ({ ...b, fromHer: true }))], tz);
    const execute = async (call: RawCall, n: number): Promise<string> => {
      const a = call.args;
      switch (call.tool) {
        case 'calendar_list_events': {
          const from = parseInstant(a['from'], tz)!; const to = parseRangeEnd(a['to'], tz)!;
          env.listed.push({ fromMs: from, toMs: to });
          const r = listEvents(world, tz, from, to);
          return JSON.stringify({ timeZone: tz, timeMin: zoned(from, tz), timeMax: zoned(to, tz), ...coverageOf(world, tz, to).fields, items: r.items, ...(r.truncated ? { nextPageToken: 'truncated' } : {}) });
        }
        case 'calendar_freebusy': {
          const from = parseInstant(a['from'], tz)!; const to = parseRangeEnd(a['to'], tz)!;
          return JSON.stringify(await freeBusyQuery(world, tz, addressList(a['emails'])!, from, to));
        }
        case 'mail_read_thread':
          return renderThread(sc, threadMsgs);
        case 'link_fetch': {
          const url = String(a['url']).trim();
          const party = Object.entries(ev.links).find(([, u]) => normalizeLink(u) === normalizeLink(url))?.[0];
          if (!party) return JSON.stringify({ error: `404: no booking page at ${url}` });
          const from = String(a['from']); const to = String(a['to']);
          const days = Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000) + 1;
          const r = await world.lookups.readLink({ party, url, durationMin, inPerson: shapeInPerson(sc), window: { from, days } });
          const cover = ctx.linkCoverage.get(party) ?? new Set<number>();
          for (const s of r.slots) { ctx.known.set(s.id, s); cover.add(s.id); }
          ctx.linkCoverage.set(party, cover);
          if (r.slots.length === 0) return JSON.stringify({ url, timeZone: tz, slots: [], ...(r.note && /did not read|can only read/i.test(r.note) ? { error: 'the page did not return open times' } : {}) });
          return JSON.stringify({ url, timeZone: tz, slots: r.slots.map((s: SlotFact) => ({ start: zoned(Date.parse(s.start), tz), end: zoned(Date.parse(s.end), tz) })) });
        }
        case 'mail_send': {
          const to = addressList(a['to'])!; const cc = addressList(a['cc'])!;
          would.push({ step: n, tool: 'mail_send', detail: { ...a } });
          const id = `mail-${ev.index + 1}-${writes.mail.length + 1}`;
          const head = `To: ${to.join(', ')}${cc.length ? `\nCc: ${cc.join(', ')}` : ''}\nSubject: ${String(a['subject'])}`;
          writes.mail.push({ from: `Winnie <${sc.world.agentAddresses[0] ?? 'winnie@agent.example.com'}>`, at: new Date(nowMs + n * 1000).toISOString(), text: `${head}\n\n${String(a['body'])}` });
          return JSON.stringify({ id, status: 'held for Bob\'s approval', note: 'It goes out when Bob approves it.' });
        }
        case 'calendar_create_event': {
          const start = parseInstant(a['start'], tz)!; const end = parseInstant(a['end'], tz)!;
          would.push({ step: n, tool: 'calendar_create_event', detail: { ...a, startUtc: new Date(start).toISOString(), endUtc: new Date(end).toISOString() } });
          const id = rawEventId(ev.index, writes.events.length + 1); // the id the mapping recorded (MapEnv.created)
          const attendees = (addressList(a['attendees']) ?? []).map((email) => ({ email, response: 'needsAction' }));
          writes.events.push({ id, source: 'work', calendarId: 'work-calendar', title: String(a['title']), startAt: new Date(start).toISOString(), endAt: new Date(end).toISOString(), allDay: false, ...(typeof a['location'] === 'string' ? { location: a['location'] } : {}), organizer: sc.world.operatorAddresses[0], attendees, myResponse: 'accepted', status: 'confirmed' } as CalEvent);
          return JSON.stringify({ id, status: 'held for Bob\'s approval', note: 'The event and its invitations are created when Bob approves it.' });
        }
        case 'bob_message':
          would.push({ step: n, tool: 'bob_message', detail: { text: a['text'] } });
          writes.bobChat.push({ at: new Date(nowMs + n * 1000).toISOString(), text: String(a['text']) });
          return JSON.stringify({ delivered: true });
        case 'done':
          return JSON.stringify({ ok: true });
      }
    };
    const ask = recordingModel(modelFn, model, BENCH_SYSTEM, calls);
    let outcome = 'capped';
    let bad = 0;
    for (let n = 1; n <= RAW_CAP; n += 1) {
      const prompt = rawPrompt(brief, ev.trigger, thread, chat, log);
      let text: string;
      try { text = await ask(prompt, `adherence:${sc.id}:A:${ev.index + 1}:${n}`); } catch (e) {
        return { condition: 'A', calls, steps, actions, outcome: 'error', would, cap: RAW_CAP, minted: world.minted(), error: String(e), writes };
      }
      const read = readRawCall(text);
      if ('why' in read) {
        const result = `unreadable: ${read.why}. Answer with one JSON object naming one of the tools.`;
        steps.push({ n, raw: text, parsed: null, unreadable: read.why, result, refused: false });
        log.push({ call: null, text, result });
        bad += 1; if (bad >= 2) { outcome = 'stuck'; break; }
        continue;
      }
      const call = read.call;
      const invalid = invalidArgs(call, tz, durationMin);
      if (invalid) {
        const result = JSON.stringify({ error: invalid });
        steps.push({ n, raw: text, parsed: call as unknown as Decision, result, refused: false });
        log.push({ call, text, result });
        bad += 1; if (bad >= 2) { outcome = 'stuck'; break; }
        continue;
      }
      bad = 0;
      const mapped = await mapRaw(env, call);
      const record: ActionRecord = { step: n, decision: mapped.decision, context: { ...snapshot(ctx), raw: mapped.raw }, refused: false, shadowed: [], raw: { tool: call.tool, args: call.args } };
      actions.push(record);
      const result = await execute(call, n);
      record.result = result;
      steps.push({ n, raw: text, parsed: call as unknown as Decision, result, refused: false });
      log.push({ call, text, result });
      if (call.tool === 'done') { outcome = 'ended'; break; }
    }
    return { condition: 'A', calls, steps, actions, outcome, would, cap: RAW_CAP, minted: world.minted(), writes };

  } catch (e) {
    return { condition: 'A', calls, steps, actions, outcome: 'error', would, cap: RAW_CAP, minted: world.minted(), error: String(e instanceof Error ? e.stack ?? e.message : e), writes };
  } finally {
    world.close();
  }
}

function shapeInPerson(sc: Scenario): boolean {
  const s = sc.plan.askShape as { mode?: string; meal?: string };
  return s.mode === 'in-person' || Boolean(s.meal);
}
