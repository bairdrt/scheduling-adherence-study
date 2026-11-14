/**
 * THE GUARD PREDICATES THE GRADERS REUSE, FROZEN AT WINNIE 34013da. graders/index.ts (V5 partiesOnly, V1 knownSlots, NF
 * notFreeNow) and graders/slots.ts (V1 recordYesRefusal, V2 everyoneCovers) read these five, and only these, from here.
 *
 * WHY: the vendored harness moved from 34013da to bd29f14 on 2026-11-09 (repo commit fe80205), and the live predicates
 * changed what V1 counts (the yes-guard reads the party's zone, and refuses a yes on a slot that came from a window
 * search). Bob ruled on 2026-11-09 that the graders do not move with the harness: the metric is the one the committed runs
 * were graded by. Design section 13 ruling 28 cites this file. V3 was frozen the same way (v3Band and outsideBandOrHours in
 * graders/index.ts).
 *
 * SOURCE: the study's redacted vendoring of 34013da, repo commit 7d24e16,
 * harness/src/capabilities/email/scheduler-agent/tools.ts. Every line below the imports is copied from that file
 * byte for byte, in its order, with its comments (where a comment says "this module's header", it means that file's
 * header). Nothing else was taken. Copied:
 *   - EXPLICIT_WINDOW_IS_A_YES, WINDOW_SLOT_IS_NOT_A_YES, UNSEEN_HAS_NO_YES (lines 108 to 129; the refusal words)
 *   - QUOTE_START, CLOCK_TOKEN, the CLOCK_SPAN pieces, CLOCK_DATE_DASH and namesAClock (lines 142 to 207; bd29f14 moved
 *     them to party-words.ts and changed them)
 *   - cardedBumps and notFreeNow (lines 421 to 432; bd29f14's notFreeNow also frees a slot by Bob's sacrifice)
 *   - lower, partiesOnly, knownSlots (lines 463 to 480; bd29f14's partiesOnly words its refusal differently)
 *   - recordYesRefusal (lines 518 to 556; bd29f14 added the asked, zone, own-link-by-instant and bare-hour routes)
 *   - Coverage, CoverParty, IN_ON_ROUTES, IN_ON_ROUTES_WORDS and everyoneCovers (lines 583 to 628; bd29f14 added the
 *     link-by-instant and Bob's-window routes and the requires amendment)
 * Imported live, because each is exported by the current harness and identical between 7d24e16 and HEAD (checked
 * 2026-11-09, function body by function body): canCarryAYes (state.ts), slotFreed (bump.ts), everyoneDecision
 * (negotiation-reply.ts). The types RunContext, SlotFact and BumpOutcome are the current ones: bd29f14 only added
 * optional fields, which these functions do not read, so no logic was adapted. If a re-vendor changes any of the three
 * live helpers, copy its 7d24e16 body here instead.
 *
 * THE RULE: this file never changes with a re-vendor. A newer harness's guards are not the study's predicates; if Bob
 * rules that a grader should move, that is a new ruling and a new file, never an edit here.
 */
import { canCarryAYes } from '../harness/src/capabilities/email/scheduler-agent/state.js';
import { slotFreed, type BumpOutcome } from '../harness/src/capabilities/email/scheduler-agent/bump.js';
import { everyoneDecision } from '../harness/src/capabilities/email/negotiation-reply.js';
import type { RunContext, SlotFact } from '../harness/src/capabilities/email/scheduler-agent/tools.js';

/**
 * WHAT AN EXPLICIT WINDOW IS, ONE PHRASE (ARCH-003; unit D of design/agent-authorship-2026-11-06.md, Bob 2026-11-06 on
 * plan 104: "She doesn't need to check again. Rory has already told us that he's open and acceptable to this"): the
 * check_calendar observation that records coverage, WINDOW_SLOT_IS_NOT_A_YES and the prompt's windows rule are built from it.
 */
export const EXPLICIT_WINDOW_IS_A_YES = 'a slot inside a window check_calendar verified as theirs (their own words, naming hours, on one day) is their conditional yes: book it, or propose it to the others';

/**
 * WHAT A WINDOWS SLOT IS, ONE PHRASE (ARCH-003): the refusal in recordYesRefusal and the prompt's rule (prompt.ts) are both
 * built from it, so the model is taught exactly what the guard refuses (plans 85 and 91, 2026-10-14). GRADED, NOT BANNED
 * since 2026-11-06 (unit D): the 10-14 rule read every window as a time she may only propose, which made plan 104 ask Rory
 * to confirm a time inside the window he had just sent. record_yes stays refused on every window slot, so the plans 85
 * and 91 guards hold as written; the yes of a verified window is coverage, which book reads (everyoneCovers).
 */
export const WINDOW_SLOT_IS_NOT_A_YES = `never a recorded yes: ${EXPLICIT_WINDOW_IS_A_YES}; a slot from any other window search is a time YOU may propose, then wait for their reply; record_yes is never the route for either`;

/**
 * WHAT A PROPOSAL NOBODY HAS SEEN IS, ONE PHRASE (the 01119b5 review, ARCH-003): the same-run refusal, the cross-run refusal
 * (a proposal still behind Bob's card, or whose mail did not go out) and the prompt's rule (prompt.ts) are built from it.
 */
export const UNSEEN_HAS_NO_YES = 'they have not seen it, so no yes to it can exist yet';

/**
 * A REPLY'S QUOTED HISTORY, AS THE STATE CARRIES IT: on one line (assemblePlanState collapses whitespace, so unquoted() in
 * quoted.ts cannot see its line starts). The captured Superhuman header is "On Wed, Oct 14, 2026 at 7:18 PM, < bob... >
 * wrote:", which carries a clock of its own; Outlook's is "From: ... Sent: ...".
 */
const QUOTE_START = /\bOn\s.{6,300}?\bwrote:|-{2,}\s*(?:Original|Forwarded) message|\bBegin forwarded message:|\bFrom:\s.{1,200}?\b(?:Sent|Date):\s/i;
/** A clock time as a person writes one: "3:45", "15:45", "3pm", "9:45 am", "10 a.m.". "between 1 and 3" and "Oct 21" are not. */
const CLOCK_TOKEN = /\b\d{1,2}:\d{2}\b|\b\d{1,2}\s*(?:am|pm|a\.m\.|p\.m\.)(?![a-z])/i;

/**
 * A CLOCK INSIDE A RANGE OR A BOUND IS A WINDOW, NOT A TIME (the 7f2556a review, ARCH-020). The forms handled, enumerated:
 *   - `between X and Y`                          "between 1 and 3 pm", "between 1pm and 3pm"
 *   - `X-Y`, `X–Y`, `X—Y` (spaces allowed)       "2-4pm", "9:30 am - 11 am", "2–4 pm"
 *   - `X to Y`                                   "10 to 11:30 am", "1 to 3pm"
 *   - `X until Y`, `X till Y`, `X til Y`,        "1pm until 3pm", "2 through 4pm" (the 491aadf review, ARCH-020: the bound
 *     `X through Y`, `X thru Y`                  words were stripped only with the clock AFTER them, so "Wednesday 1pm
 *                                                until 3pm" left 1pm standing and read as a named clock)
 *   - a bound word and X, optionally a range:    after, before, from, until, till, til, through, thru, by, no earlier than,
 *                                                no later than, past, later than, earlier than, any time later/earlier than
 *                                                ("any time after 2pm", "before 11 a.m.", "from 2 to 4pm", "by 3pm", "free
 *                                                through 3pm", "past 2pm", "later than 2pm"; the last three the dd537ae review)
 *   - `between X & Y`                            "between 1 & 3pm" (the dd537ae review)
 *   - X and a trailing bound (the dd537ae         "2pm or later", "2pm or after", "11am or earlier", "11am or before",
 *     review, ARCH-020: every bound word above    "2pm onward(s)", "2pm and later", "2pm and after", and "2pm on" only where
 *     stood BEFORE its clock, so "2pm or later"   the "on" ends the phrase: punctuation or the end of the text after it, or
 *     kept its clock and read as a named time)    is/works/would/should/could/suits. "2pm on Wednesday" is a named clock,
 *                                                and stays one.
 * X and Y are a bare hour, H:MM, either with am/pm. Every meridiem form above is INVENTED (no capture holds one: the
 * driver's windows template writes "between 1 and 3"); the CLOCK table in scheduler-agent-yes-needs-a-yes.test.ts marks
 * those rows so.
 *
 * THIS LIST IS THE ENUMERATION. A form not in it is not guarded: its clock stays, namesAClock returns true, and a window
 * is read as a named time (the dangerous direction). Known to be outside it: "2pm-ish", "around 2pm", "2pm or so", "2pm
 * at the latest", "2pm at the earliest", "2pm and beyond", "2pm or thereabouts", "2pm on" followed by any word but
 * the six above ("2pm on for us"), a window written in words ("two to four"), and every non-English form. The other
 * way, on the refusing side: "half past 2pm" reads as the bound "past 2pm", so that named clock is refused (INVENTED; no
 * capture writes "half past").
 */
const SPAN_T = String.raw`\b\d{1,2}(?::\d{2})?(?:\s*(?:am|pm|a\.m\.|p\.m\.)(?![a-z]))?`;
const SPAN_SEP = String.raw`(?:\s*[-–—]\s*|\s+(?:to|until|till|til|through|thru)\s+)`;
const SPAN_BOUND = String.raw`\b(?:after|before|from|until|till|til|through|thru|by|past|no earlier than|no later than|(?:any\s*time\s+)?(?:later|earlier)\s+than)\s+`;
/** A bound AFTER its clock (the dd537ae review, ARCH-020): "2pm or later", "2pm onwards", "2pm and after", a phrase-final "2pm on". */
const SPAN_TRAIL = String.raw`\s+(?:or\s+(?:later|after|earlier|before)\b|onwards?\b|on(?=\s*(?:$|[.,;:!?)]|(?:is|works?|would|should|could|suits?)\b))|and\s+(?:later|after)\b)`;
const CLOCK_SPAN = new RegExp(`\\bbetween\\s+${SPAN_T}(?:\\s+and\\s+|\\s*&\\s*)${SPAN_T}|(?:${SPAN_BOUND})?${SPAN_T}${SPAN_SEP}${SPAN_T}|${SPAN_BOUND}${SPAN_T}|${SPAN_T}${SPAN_TRAIL}`, 'gi');

/**
 * A DATE, THEN A SPACED DASH, THEN A CLOCK, IS NOT A RANGE (the NOTE of the 491aadf review, ARCH-020): SPAN_T takes a bare
 * day number, so "Wednesday, Oct 21 - 3:45 pm" stripped "21 - 3:45 pm" as a window and a real clock yes was refused. A
 * month name (or a numeric M/D) then the day, then a dash WITH SPACES on both sides, is rewritten to a comma before the
 * span strip. Unspaced ("Oct 2-4pm") stays a range: the guard's failure must stay on the refusing side when it is unsure.
 * Both forms are INVENTED (no capture writes a date before a dash).
 */
const CLOCK_DATE_DASH = /\b((?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2}(?:st|nd|rd|th)?|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\s+[-–—]\s+/gi;

/**
 * DID THE PARTY WRITE A CLOCK TIME (the 01119b5 review, ARCH-020)? Their words above any quoted history, with every range
 * and bound stripped (CLOCK_SPAN, the 7f2556a review; a date before a spaced dash first kept as a date, CLOCK_DATE_DASH),
 * tested for a clock token. A FORMAT GUARD, tested against every distinct party text in tests/fixtures/harness/runs/ and both real quoted
 * bodies there (scheduler-agent-yes-needs-a-yes.test.ts); its limits are in this module's header. Called by
 * recordYesRefusal in this module.
 */
export function namesAClock(text: string): boolean {
  const cut = text.search(QUOTE_START);
  return CLOCK_TOKEN.test((cut >= 0 ? text.slice(0, cut) : text).replace(CLOCK_DATE_DASH, '$1, ').replace(CLOCK_SPAN, ' '));
}

/** The event ids whose move is behind a card from this run's bumps. */
function cardedBumps(ctx: Pick<RunContext, 'bumps'>): Set<string> {
  return new Set([...(ctx.bumps ?? new Map<string, BumpOutcome>())].filter(([, o]) => o.kind === 'carded').map(([id]) => id));
}

/**
 * NOT FREE, AND NOT FREED (unit 2): a slot that is not free on Bob's side and whose blockers are not all moved off it by a
 * carded bump. The one test record_yes, propose and book ask (ARCH-004).
 */
export function notFreeNow(ctx: Pick<RunContext, 'bumps'>, s: SlotFact | undefined): boolean {
  return s !== undefined && s.free === false && !slotFreed(s, cardedBumps(ctx));
}

const lower = (a: string): string => a.trim().toLowerCase();

// BENCH: exported (was module-private) so graders/ reuse the guard's own predicate.
export function partiesOnly(ctx: RunContext, to: unknown): { ok: true; to: string[] } | { ok: false; why: string } {
  if (!Array.isArray(to) || to.length === 0 || !to.every((t) => typeof t === 'string')) return { ok: false, why: '"to" must be a non-empty list of addresses' };
  const parties = new Set(ctx.state.parties.map((p) => p.address));
  const bad = (to as string[]).map(lower).filter((t) => !parties.has(t));
  if (bad.length > 0) return { ok: false, why: `not a party of this plan: ${bad.join(', ')}; the parties are ${[...parties].join(', ')}` };
  return { ok: true, to: (to as string[]).map(lower) };
}

// BENCH: exported (was module-private) so graders/ reuse the guard's own predicate.
export function knownSlots(ctx: RunContext, ids: unknown): { ok: true; ids: number[] } | { ok: false; why: string } {
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((n) => Number.isInteger(n))) return { ok: false, why: '"slots" must be a non-empty list of slot ids' };
  const unknown = (ids as number[]).filter((n) => !ctx.known.has(n));
  if (unknown.length > 0) return { ok: false, why: `slot ${unknown.join(', ')} did not come from check_calendar or read_link in this run, and is not one you offered on this plan; only those ids may be offered, booked or said yes to` };
  return { ok: true, ids: ids as number[] };
}


/**
 * THE GUARD ON A YES (record_yes): the party is on the plan, the slot is one this run or this plan knows, and it is free on
 * Bob's side (a not-free verdict's id is synthetic and on no offer record, so a yes to it could never be booked). A reason,
 * or null. Called by runTool in this module; tests/scheduler-agent.test.ts drives every refusal through the loop.
 */
export function recordYesRefusal(ctx: RunContext, party: unknown, slot: unknown): string | null {
  const parties = ctx.state.parties.map((p) => p.address);
  if (typeof party !== 'string' || !parties.includes(lower(party))) return `record_yes needs "party", an address on this plan; ${typeof party === 'string' ? `${party} is not one; ` : ''}the parties are ${parties.join(', ')}`;
  if (!Number.isInteger(slot)) return 'record_yes needs "slot", the id they said yes to';
  const known = knownSlots(ctx, [slot]);
  if (!known.ok) return known.why;
  const s = ctx.known.get(slot as number)!;
  // NOT FREE, UNLESS A BUMP FREED IT (unit 2; plan 102, 2026-10-27 20:13:09: "REFUSED: slot 100000 is not free" after Bob
  // had said to move the Hollis sync, and nothing could): a blocker check_calendar named bumpable is bumped first.
  if (notFreeNow(ctx, s)) return `slot ${String(slot)} is not free on Bob's side${s.freeable ? ', and what is in the way has not been bumped' : ''}, so a yes to it cannot be booked; ${s.freeable ? 'bump each blocker check_calendar named for it (if Bob said to), or ' : ''}tell Bob or offer another time`;
  // A YES NEEDS A YES (plans 85 and 91, 2026-10-14): the vendor gave three afternoons in words, and the loop recorded their
  // yes on the earliest free slot a windows search found (85), or on a slot it had proposed a step earlier in the same run
  // (91), and carded the booking. The party must have been able to agree to THIS slot: she offered it to them before this
  // run, they named its clock time (a "times" check), or it is open on their own booking link.
  const who = lower(party);
  const why = ctx.offeredWhy.get(s.id);
  if (canCarryAYes(why)) return null;
  if (s.source === 'link') return s.party === who ? null : `slot ${s.id} is from ${s.party ?? 'another party'}'s booking link, which is their availability, not ${who}'s; propose it to ${who} and wait for their reply.`;
  if (s.named) {
    // A "times" check says which argument the model chose, not what they said (the 01119b5 review, ARCH-020): their own
    // latest message must name a clock. The limits of that format guard are in this module's header.
    const latest = ctx.state.parties.find((p) => p.address === who)?.said.slice(-1)[0]?.text ?? '';
    if (namesAClock(latest)) return null;
    return `slot ${s.id} came from a "times" check, but ${who}'s latest message names no clock time (like "3:45 pm" or "15:45"); a day or a part of a day ("Wednesday afternoon") is their window, so the slot is a time YOU may propose, not a time they agreed to. Propose it and wait for their reply.`;
  }
  if (ctx.proposedThisRun.get(s.id)?.has(who)) return `slot ${s.id} went to them in this run, behind a card for Bob's tap; ${UNSEEN_HAS_NO_YES}. Wait for their reply.`;
  // The cause is offeredWhy's, the computation offeredOnPlan reads (the 01119b5 review, ARCH-004), so it cannot name a wrong one.
  if (why === 'not-out') return `slot ${s.id} is in a proposal that has not reached them, or cannot be shown to have: it is still behind Bob's card, its mail did not go out, or whether its mail left is not known (SENT says which); ${UNSEEN_HAS_NO_YES}. Wait for their reply, or tell Bob.`;
  if (s.source === 'calendar') return `slot ${s.id} came from a window or windows search, which is ${WINDOW_SLOT_IS_NOT_A_YES}.`;
  if (why === 'booking-only') return `slot ${s.id} was never offered to them (it is on the plan only as a booking); propose it and wait for their reply.`;
  return `slot ${s.id} was never offered to them; propose it and wait for their reply.`;
}


/** everyoneCovers' verdict, with the parties (addresses) who are in on the slot: standingOn renders from `inOn`. */
export type Coverage = { ok: true; inOn: string[] } | { ok: false; why: string; inOn: string[] };

/**
 * THE EVERYONE RULE ON A BOOKING: every party has a yes on THIS slot, or a link read this run that covers it, or a window
 * of theirs verified this run that covers it (unit D), one party or many. `ok` exactly when `inOn` is every party. Called
 * by runTool's book and by standingOn in this module.
 *
 * ONE PARTY STILL NEEDS A YES (counter rerun, plan 58, 2026-10-10 23:43: the loop booked the vendor's own Monday straight
 * from the check, no record_yes; everyoneDecision books a one-party plan unconditionally because the old path reached it
 * only after reading a yes). A YES ON ANOTHER SLOT IS NOT A YES ON THIS ONE (the cad66c3 review: the first fix asked only
 * for a yes on SOME slot, so a party whose standing yes was on slot 5 could be booked on 217 straight from a check).
 * everyoneDecision is kept for the split message only.
 */
/** A party as everyoneCovers reads one: its address and the slot of its recorded yes, if any. */
type CoverParty = { address: string; acceptedSlot?: number };

/**
 * THE WAYS A PARTY IS IN ON A SLOT, ONE DECLARATION (ARCH-003, reviews of 4620c87 and 4317a93). Each route carries its
 * words and its test together: everyoneCovers' `onThis` is IN_ON_ROUTES.some(covers), and its refusal and both prompt
 * rules (prompt.ts) read IN_ON_ROUTES_WORDS, derived from the words. Until 4317a93's review the words were a list and
 * `onThis` a hand-written disjunction beside it ("the order is everyoneCovers' own onThis"), so a fourth route added to
 * the check would have left the refusal and the rules naming three, and nothing would fail. A route is now one entry.
 */
export const IN_ON_ROUTES: ReadonlyArray<{ words: string; covers: (ctx: Pick<RunContext, 'linkCoverage' | 'windowCoverage'>, p: CoverParty, slot: number) => boolean }> = [
  { words: 'a yes on the thread', covers: (_ctx, p, slot) => p.acceptedSlot === slot },
  { words: 'a link that covers it', covers: (ctx, p, slot) => ctx.linkCoverage.get(p.address)?.has(slot) === true },
  // THEIR OWN WINDOW COVERS IT (unit D): verified by check_calendar this run (windowCoverageRefusal).
  { words: 'a window of theirs check_calendar verified with their own words', covers: (ctx, p, slot) => ctx.windowCoverage?.get(p.address)?.slots.has(slot) === true },
];
const IN_ON_WORDS = IN_ON_ROUTES.map((r) => r.words);
/** The routes as a sentence names them: "a yes on the thread, a link that covers it, or a window of theirs ...". */
export const IN_ON_ROUTES_WORDS = `${IN_ON_WORDS.slice(0, -1).join(', ')}, or ${IN_ON_WORDS[IN_ON_WORDS.length - 1]}`;

export function everyoneCovers(ctx: RunContext, slot: number): Coverage {
  const parties = ctx.state.parties.map((p) => p.address);
  const onThis = (p: CoverParty): boolean => IN_ON_ROUTES.some((r) => r.covers(ctx, p, slot));
  const inOn = ctx.state.parties.filter(onThis).map((p) => p.address);
  const notIn = parties.filter((p) => !inOn.includes(p));
  if (notIn.length === 0) return { ok: true, inOn };
  // Each party's standing word: on this slot when they are in on it, else the slot they said yes to; nothing for no word.
  const standing = ctx.state.parties.flatMap((p) => (onThis(p) ? [{ party: p.address, slot, at: '' }] : p.acceptedSlot !== undefined ? [{ party: p.address, slot: p.acceptedSlot, at: '' }] : []));
  const d = everyoneDecision(parties, standing, slot);
  if (d.kind === 'split') return { ok: false, inOn, why: `the parties are split: ${Object.entries(d.bySlot).map(([n, ps]) => `slot ${n}: ${ps.join(', ')}`).join('; ')}` };
  return { ok: false, inOn, why: `not everyone is in on slot ${slot}: waiting on ${notIn.join(', ')} (${IN_ON_ROUTES_WORDS})` };
}
