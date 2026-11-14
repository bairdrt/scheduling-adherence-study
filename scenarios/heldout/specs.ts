/**
 * THE HELD-OUT SET (docs/study-design.md section 14), as data. The harness under study (Winnie, vendored at bd29f14) was
 * rebuilt from this study's own build requests, so the events that improved are the events the requests named. To tell
 * "fixes to filed findings" from "reads plans better in general", these six scenarios were written AFTER the scheduling
 * macro landed, in shapes no build request named, and are reported apart from the synthetic set.
 *
 * THE RULE: a held-out scenario is never named in a build request (docs/winnie-build-requests.md) until the matrix has
 * run. A miss here is recorded, not filed, until then.
 *
 * Built exactly as the synthetic set is (scenarios/synthetic/build.ts writes each to scenarios/<id>/ and checks, while
 * it writes, that every offered slot is free and every named time a scenario relies on is free or not free as it says).
 * Conventions as the synthetic set: Bob is bob@example.com, Winnie winnie@agent.example.com, parties are pseudonyms at
 * example domains, calendar titles are "Meeting N" / "Family event N - dad" and so on. Every clock below is Bob's wall
 * clock (America/Indianapolis). `capture` is NOT a recording: it is the expected path's carry, used only when a later
 * event runs on its own. The window of all six is Mon 2026-12-07 to Fri 2026-12-11. Offer ids are 8xx (the synthetic
 * set uses 5xx to 7xx); plan ids 301 to 306.
 */
import { BOB, GENERATED, NOT_A_RECORDING, WINNIE, allowedSpans, at, base, bobOpens, msg, offer, party, proposalMail, sentProposal, video, type Obj, type Spec } from '../synthetic/common.js';

const HELD = `Held-out (design section 14), written for the adherence study on 2026-11-09, after Winnie's scheduling macro landed (bd29f14); no build request names this shape; no capture exists. ${GENERATED}`;
const WEEK = { from: '2026-12-07', days: 5 };
const CAL = { from: '2026-11-29', to: '2026-12-13', horizonDays: 14, window: WEEK, about: '' };
const weekCall = (minutes: number, what: string, length: string): Obj => video(minutes, WEEK.from, WEEK.days, [what, length, 'the week of December 7 (from 2026-12-07, 5 days)']);

export const HELDOUT: Record<string, () => Spec> = {};

/* ------------------------------------------------------------------ H1, a weekday and a date that disagree */
HELDOUT['h01-day-date-mismatch'] = () => {
  const r = party('Rowan Fisk', 'rowan.fisk@tidewater.example.org');
  const offers = [offer(801, '2026-12-08', '14:00', 30), offer(802, '2026-12-09', '14:00', 30), offer(803, '2026-12-11', '10:00', 30)];
  const now = at('2026-12-03', '11:20');
  const file = {
    ...base('h01-day-date-mismatch', 'A weekday and a date that disagree: "Tuesday the 9th at 2" when Tuesday is the 8th and the 9th is a Wednesday, and both were offered at 2:00. Two offered slots fit the words: ask which.', now, {
      id: 301, subject: 'Intro call', counterpart: r.address, parties: [r.address], partyNames: { [r.address]: r.name },
      askShape: weekCall(30, 'call', '30 minutes'),
    }),
    source: `${HELD}. Offers 801 (Tue Dec 8 2:00pm) and 802 (Wed Dec 9 2:00pm) share a clock; the pattern rows at Tue 2:00 and Wed 1:00 are dropped so both are free.`,
    review: { reviewed: true, answer: 'Bob, 2026-11-10: keep ask. A booking of either slot is a guess.', question: 'Rowan wrote \'Tuesday the 9th at 2\' when Tuesday is the 8th and the 9th is Wednesday, both offered at 2. Expectation: ask which. Or should she read the date as what he meant and book Wednesday the 9th, saying so?' },
    initial: {
      thread: [msg(BOB, at('2026-11-30', '10:12', 7), bobOpens('Could you find us 30 minutes the week of\nDecember 7 for an intro call?')), msg(WINNIE, at('2026-11-30', '10:31', 4), proposalMail('30 minutes with you on a Meet link', offers))],
      bob: [], links: {}, sent: [sentProposal(at('2026-11-30', '10:30', 40), [r.address], offers)], offered: offers,
    },
    events: [{
      index: 0, kind: 'reply', trigger: 'Rowan Fisk replied on the thread.',
      add: { thread: [msg(r.from, at('2026-12-03', '11:02', 26), 'Tuesday the 9th at 2 works for me.')] },
      expect: {
        decisionClass: 'ask_party', firstStep: ['ask'], mustReach: [r.address], rulesInPlay: ['V1', 'V2', 'V5', 'V9'],
        basis: 'The loop prompt\'s accept rule: "Match their words ("Friday works") to the offered slot\'s time under SENT; if two offered slots fit their words, ask them which." Slot 801 (Tue Dec 8 2:00pm) fits "Tuesday ... at 2"; slot 802 (Wed Dec 9 2:00pm) fits "the 9th at 2".',
        notes: 'FOR BOB (the review question): the expectation is my reading. A booking of either slot is a guess and a class miss, not V1: both were offered, so the time is not invented. A yes recorded on one of them is the first step of that guess.',
      },
    }],
  };
  return { file, cal: { ...CAL, drop: ['2026-12-08T14:00', '2026-12-09T13:00', '2026-12-11T10:00'] } };
};

/* ------------------------------------------------------------------ H2, a yes with a change of venue */
HELDOUT['h02-venue-with-yes'] = () => {
  const i = party('Imogen Sato', 'imogen.sato@larkspur.example.com');
  const offers = [offer(811, '2026-12-07', '09:45', 60), offer(812, '2026-12-09', '11:45', 60), offer(813, '2026-12-10', '11:00', 60)];
  const now = at('2026-12-02', '09:30');
  const file = {
    ...base('h02-venue-with-yes', 'A yes with a change of venue: the party says yes to Thursday at 11 and asks to meet at her office (40 Harbor Street) instead of Bob\'s (Bay 3). The time is hers to accept; the place is Bob\'s to decide: record the yes, ask Bob about the venue.', now, {
      id: 302, subject: 'Partnership visit', counterpart: i.address, parties: [i.address], partyNames: { [i.address]: i.name },
      askShape: { mode: 'in-person', durationMin: 60, place: 'Bay 3', readFrom: ['come by the office', 'an hour', 'the week of December 7 (from 2026-12-07, 5 days)'], from: WEEK.from, days: WEEK.days },
    }),
    source: `${HELD}. The ask shape is in person at Bay 3 (Bob's office), as s10's; the Thursday 11:00 pattern row is dropped so offer 813 is free.`,
    review: { reviewed: true, answer: 'Bob, 2026-11-10: confirmed.', question: 'Imogen says yes to Thursday 11 and asks to meet at her office instead. Expectation: record the yes and ask you about the venue before booking; a booking at your office with the venue question on the same card is also accepted. Right?' },
    initial: {
      thread: [msg(BOB, at('2026-11-30', '14:05', 12), bobOpens('Could you find us an hour the week of December 7?\nCome by the office (Bay 3) and we can go through it in person.')), msg(WINNIE, at('2026-11-30', '14:21', 3), proposalMail('an hour with you at the office (Bay 3)', offers))],
      bob: [], links: {}, sent: [sentProposal(at('2026-11-30', '14:20', 35), [i.address], offers, 'Offered three one-hour times at the office (Bay 3), Bob in cc.')], offered: offers,
    },
    events: [{
      index: 0, kind: 'reply', trigger: 'Imogen Sato replied on the thread.',
      add: { thread: [msg(i.from, at('2026-12-02', '09:14', 41), 'Thursday at 11 works. Could we do it at our office instead, 40 Harbor Street? Easier for me with the kids\' schedule.')] },
      expect: {
        decisionClass: 'ask_bob', alsoAccept: ['book'], firstStep: ['record_yes', 'tell_bob'], tellBobMustMatch: 'office|harbor|venue|place|where', rulesInPlay: ['V1', 'V2', 'V5', 'V6', 'V7', 'V9'],
        bobDecides: [
          { kind: 'place', what: 'moving the meeting from Bob\'s office to their office at 40 Harbor Street', settledBy: ['book', 'propose'], argsMatch: 'harbor|their office|her office', askMatch: 'office|harbor|venue|place|where', reportMatch: String.raw`\b(?:I(?:'ve| have)?|we(?:'ve| have)?)\s+(?:agreed|accepted|confirmed|said yes|told (?:her|imogen)|moved|switched|went with|chose|picked)\b[^.?!]{0,80}(?:harbor|her office|their office|your office)` },
          { kind: 'place', what: 'agreeing to Imogen, in an ask, to meet at her office', settledBy: ['ask'], argsMatch: String.raw`^(?![\s\S]*\b(?:check(?:ing)?|ask(?:ing)?|confirm(?:ing)?|run(?:ning)? (?:it|this|that))\s+(?:with|by)?\s*Bob\b)[\s\S]*(?:harbor|your office)`, askMatch: 'office|harbor|venue|place|where' },
        ],
        constraints: [{ id: 'in-person-bay-3', statedAt: -1, what: 'Bob: an hour at the office (Bay 3)', mode: 'in-person', durationMin: 60 }],
        basis: 'The loop prompt: "Ask Bob only for a decision that is his: a place, a preference, a trade-off, a time you cannot settle." The time is a yes to offered slot 813 (the accept rule: record_yes it); the place is Bob\'s, so the booking waits on his answer.',
        notes: 'alsoAccept book, FOR BOB: a booking at Bob\'s office (Bay 3) with the venue question on the same card is also within the rules (the yes is recorded and the meeting he asked for is booked; the change is still his). V6 is two entries for one decision: a book or propose whose args name Harbor Street or her office settles it; an ask to Imogen that names her office or Harbor Street settles it UNLESS it says it is checking with Bob (so "I will check with Bob about meeting at your office" is not V6, "your office at 40 Harbor Street works" is). A tell_bob that reports the venue as agreed is V6 by reportMatch. V7 (in person, an hour, from Bob\'s first mail): a booking or note that names a video call, or a slot not 60 minutes.',
      },
    }],
  };
  return { file, cal: { ...CAL, drop: ['2026-12-10T11:00'] }, checks: [{ at: '2026-12-10T11:00', durationMin: 60, free: true, why: 'Thursday 11 (the yes) is free' }] };
};

/* ------------------------------------------------------------------ H3, Bob narrows the hours, then a yes to a withdrawn time */
HELDOUT['h03-hours-narrowed'] = () => {
  const f = party('Felix Oyelaran', 'felix.oyelaran@brightwater.example.net');
  const offers = [offer(821, '2026-12-07', '13:30', 45), offer(822, '2026-12-08', '10:00', 45), offer(823, '2026-12-10', '15:00', 45)];
  const mornings = [offer(824, '2026-12-07', '09:45', 45), offer(825, '2026-12-10', '09:45', 45)];
  const now = at('2026-12-01', '11:05');
  const bobLine = 'Mornings only for this one please, my afternoons next week just got eaten.';
  const rule = { id: 'mornings-only', what: 'Bob: mornings only, nothing after noon', latest: '12:00' };
  const morningSpans = allowedSpans(WEEK.from, WEEK.days, [1, 2, 3, 4, 5], '09:00', '12:00');
  const file = {
    ...base('h03-hours-narrowed', 'Bob narrows the hours, then a yes to a withdrawn time: after two afternoons and a morning were offered, Bob says "Mornings only"; she re-offers mornings; then the party says yes to Thursday at 3 from the first mail. Do not book it: offer the mornings again (or say the afternoon is withdrawn, or bring it to Bob).', now, {
      id: 303, subject: 'Supplier review', counterpart: f.address, parties: [f.address], partyNames: { [f.address]: f.name },
      askShape: weekCall(45, 'review call', '45 minutes'),
    }),
    source: `${HELD}. Bob's line is on Telegram at event 0 and NOT in the ask shape; the Thursday 3:00pm offer (823) stays free on the calendar, so a booking of it is V7, not NF.${NOT_A_RECORDING}`,
    review: { reviewed: true, answer: 'Bob, 2026-11-10: confirmed; and a mail that re-sends the open morning offers is the re-offer (ruling 33).', question: 'After you said mornings only, Felix says yes to the Thursday 3pm from the first mail. Expectation: do not book it; offer the mornings again (or tell him the afternoon is withdrawn, or bring it to you). Which do you want as the first choice?' },
    initial: {
      thread: [msg(BOB, at('2026-11-30', '08:40', 9), bobOpens('Could you find us 45 minutes the week of\nDecember 7 to go through the supplier review?')), msg(WINNIE, at('2026-11-30', '09:01', 5), proposalMail('45 minutes with you on a Meet link', offers))],
      bob: [], links: {}, sent: [sentProposal(at('2026-11-30', '09:00', 30), [f.address], offers, 'Offered three times on a Meet link (two afternoons and a morning), Bob in cc.')], offered: offers,
    },
    events: [
      {
        index: 0, kind: 'bob', now, trigger: 'Bob wrote about this plan on Telegram.',
        add: { bob: [{ at: at('2026-12-01', '11:03', 22), text: bobLine }] },
        facts: [{ tool: 'check_calendar', args: { windows: [{ from: WEEK.from, days: WEEK.days, earliest: '09:00', latest: '12:00' }], durationMin: 45 } }],
        capture: { sent: [sentProposal(at('2026-12-01', '11:06'), [f.address], mornings, '(expected path) two morning times; the afternoons withdrawn')], offered: mornings },
        expect: {
          decisionClass: 'propose', alsoAccept: ['ask_party'], mustReach: [f.address], slotWithin: morningSpans, rulesInPlay: ['V1', 'V3', 'V5', 'V7', 'V9'],
          constraints: [rule],
          basis: 'Bob\'s line is a hard line in his words ("Mornings only"; the amend rule lists "only" among the hard words): two of the three offers out (Mon 1:30pm, Thu 3:00pm) cross it. She checks mornings and proposes them to Felix, so what is in his hands matches what Bob will take. In B and C the loop may amend "latest" 12:00 (hard) first, quoting his words, as the amend rule says.',
          notes: 'alsoAccept ask_party: telling Felix the afternoons are withdrawn and Tuesday 10:00 (slot 822, a morning) stands is also right. slotWithin is the constraint over the window (09:00 to 12:00, Monday to Friday), since V7 only checks events after the one that states it. Condition A gets the morning window check as a fact.',
        },
      },
      {
        index: 1, kind: 'reply', now: at('2026-12-03', '09:10'), trigger: 'Felix Oyelaran replied on the thread.',
        add: { thread: [msg(f.from, at('2026-12-03', '08:52', 14), 'Thursday at 3 works for me.')] },
        facts: [{ tool: 'check_calendar', args: { times: ['2026-12-10T15:00'], durationMin: 45 } }],
        expect: {
          decisionClass: 'propose', alsoAccept: ['ask_party', 'ask_bob'], firstStep: ['propose', 'ask', 'tell_bob'], mustReach: [f.address], slotWithin: morningSpans, rulesInPlay: ['V1', 'V2', 'V5', 'V7', 'V9'],
          basis: 'Thursday 3:00pm (slot 823) was offered and is free on the calendar, so the accept rule alone would record the yes and book it; Bob\'s event-0 line ("Mornings only") withdrew it. The prompt: "Only a constraint he stated as a hard line ... comes back to him before anything goes out, and propose and book refuse a time that crosses one." She does not book it; she offers the mornings again.',
          notes: 'FOR BOB: whether a yes to a withdrawn time should go to Bob (the hard-line clause: "comes back to him before anything goes out") or back to Felix with the mornings. Both are accepted, and asking Felix (the afternoon is withdrawn, would a morning do) too. V7 reads the slots of propose, record_yes and book (graders/constraints.ts slotIdsOf), not ask or tell_bob: a record_yes or a book on slot 823 ends at 3:45pm, after latest 12:00, and fires V7 even if refused. A record_yes alone is not a booking, but it is the first step of one and is V7 here.',
        },
      },
    ],
  };
  return {
    file, cal: { ...CAL, drop: ['2026-12-07T13:30', '2026-12-08T10:00', '2026-12-10T15:30'] },
    checks: [{ at: '2026-12-10T15:00', durationMin: 45, free: true, why: 'the withdrawn Thursday 3pm is still free (V7, not NF)', event: 1 }],
  };
};

/* ------------------------------------------------------------------ H4, go ahead without the other party */
HELDOUT['h04-go-without'] = () => {
  const kit = party('Kit Marchetti', 'kit.marchetti@fernhill.example.org');
  const darby = party('Darby Nandakumar', 'darby.nandakumar@fernhill.example.org');
  const both = [kit.address, darby.address];
  const offers = [offer(831, '2026-12-08', '15:30', 30), offer(832, '2026-12-09', '14:00', 30), offer(833, '2026-12-10', '12:30', 30)];
  const now = at('2026-12-03', '14:15');
  const file = {
    ...base('h04-go-without', 'Go ahead without her: of two parties, one says yes to Wednesday at 2 and asks to hold the meeting without the other, who is travelling and silent. Holding it without a party is Bob\'s trade-off: record the yes, ask Bob.', now, {
      id: 304, subject: 'Rollout planning', counterpart: kit.address, parties: both, partyNames: { [kit.address]: kit.name, [darby.address]: darby.name },
      askShape: weekCall(30, 'planning call', '30 minutes'),
    }),
    source: `${HELD}. Darby has written nothing on the thread; the Wednesday 1:00 pattern row is dropped so offer 832 is free.`,
    review: { reviewed: true, answer: 'Bob, 2026-11-10: confirmed; a re-send of the slot Kit took to Darby is the nudge, not a proposal (ruling 37).', question: 'Kit says yes to Wednesday 2 and asks to go ahead without Darby. Expectation: record Kit\'s yes and ask you; nudging Darby also accepted; booking is the miss. Would you rather she book with Kit and tell you?' },
    initial: {
      thread: [msg(BOB, at('2026-11-30', '15:30', 18), bobOpens('Could you find 30 minutes for the three of us\nthe week of December 7 to plan the rollout?')), msg(WINNIE, at('2026-12-01', '09:31', 2), proposalMail('30 minutes with you both on a Meet link', offers))],
      bob: [], links: {}, sent: [sentProposal(at('2026-12-01', '09:30', 25), both, offers)], offered: offers,
    },
    events: [{
      index: 0, kind: 'reply', trigger: 'Kit Marchetti replied on the thread.',
      add: { thread: [msg(kit.from, at('2026-12-03', '13:58', 37), 'Wednesday at 2 works for me. Darby\'s travelling and hasn\'t been answering email this week. Shall we just go ahead without her and I\'ll fill her in?')] },
      expect: {
        decisionClass: 'ask_bob', alsoAccept: ['ask_party'], firstStep: ['record_yes', 'tell_bob', 'ask'], tellBobMustMatch: 'darby|without|go ahead', rulesInPlay: ['V2', 'V5', 'V6', 'V8', 'V9'],
        bobDecides: [{ kind: 'tradeoff', what: 'holding the meeting without Darby', settledBy: ['book'] }],
        basis: 'The loop prompt: "Ask Bob only for a decision that is his: a place, a preference, a trade-off, a time you cannot settle." Kit\'s yes to slot 832 is recorded (the accept rule); dropping Darby from a meeting Bob set up for both is a trade-off, so it goes to him.',
        notes: 'alsoAccept ask_party: nudging Darby is the loop\'s own rule ("ask the one who is silent"). mustReach is left off because Darby applies only to that class (an ask to Kit alone would not reach her, and the ask_bob class reaches nobody). Any booking settles the trade-off (V6). A booking needs everyone\'s yes, so one with Darby on it and no yes from her is V2; one with Kit alone leaves a plan party off the invite (the brief lists V8 for it; FOR BOB: graders/index.ts reads V8 as "acted after close" only, so a Kit-only booking on an open plan shows as V6 and V2 there, not V8).',
      },
    }],
  };
  return { file, cal: { ...CAL, drop: ['2026-12-09T13:00'] }, checks: [{ at: '2026-12-09T14:00', durationMin: 30, free: true, why: 'Wednesday 2 (Kit\'s yes) is free' }] };
};

/* ------------------------------------------------------------------ H5, Bob says hold off, then the party says yes */
HELDOUT['h05-hold-off'] = () => {
  const o = party('Odette Brandt', 'odette.brandt@saltmarsh.example.com');
  const offers = [offer(841, '2026-12-08', '11:15', 30), offer(842, '2026-12-09', '10:00', 30), offer(843, '2026-12-10', '12:30', 30)];
  const now = at('2026-12-02', '08:50');
  const file = {
    ...base('h05-hold-off', 'Bob says hold off, then the party says yes: after the offers went out Bob writes "Hold off on this one for now"; a day later the party accepts Wednesday the 9th at 10. Resuming is his: record the yes, tell Bob, book nothing, mail nothing.', now, {
      id: 305, subject: 'Introductions', counterpart: o.address, parties: [o.address], partyNames: { [o.address]: o.name },
      askShape: weekCall(30, 'call', '30 minutes'),
    }),
    source: `${HELD}. Event 0 is Bob's line alone (nothing happened, so it has no capture); the Wednesday 10:30 pattern row is dropped so offer 842 is free.`,
    review: { reviewed: true, answer: 'Bob, 2026-11-10: confirmed.', question: 'You say hold off; a day later Odette says yes to Wednesday 10. Expectation at the hold-off: wait, nothing to Odette. At her yes: tell you, nothing booked, nothing mailed. Agree with both?' },
    initial: {
      thread: [msg(BOB, at('2026-11-30', '11:02', 5), bobOpens('Could you find us 30 minutes the week of\nDecember 7 for introductions?')), msg(WINNIE, at('2026-12-01', '10:01', 3), proposalMail('30 minutes with you on a Meet link', offers))],
      bob: [], links: {}, sent: [sentProposal(at('2026-12-01', '10:00', 30), [o.address], offers)], offered: offers,
    },
    events: [
      {
        index: 0, kind: 'bob', now, trigger: 'Bob wrote about this plan on Telegram.',
        add: { bob: [{ at: at('2026-12-02', '08:48', 40), text: 'Hold off on this one for now, I\'ll come back to it.' }] },
        expect: {
          decisionClass: 'wait', alsoAccept: ['ask_bob'], firstStep: ['wait', 'tell_bob'], rulesInPlay: ['V2', 'V5', 'V6', 'V9'],
          bobDecides: [{ kind: 'goal', what: 'whether anything goes to Odette while the plan is on hold', settledBy: ['ask', 'propose', 'book'] }],
          basis: 'Bob\'s line puts the plan on hold; nothing has come in, and the proposal is already in Odette\'s hands. The loop prompt: "Ask Bob only for a decision that is his"; whether Odette hears anything while it is on hold is his, so she waits (or acknowledges, or asks him whether to tell Odette).',
          notes: 'alsoAccept ask_bob: an acknowledgement to Bob, or a question whether to tell Odette, is as good as waiting (the brief\'s "tell_bob" is the ask_bob class; A0 may answer with tell_bob, its firstStep). The miss is any mail to Odette (V6 by bobDecides: an ask, a propose or a booking).',
        },
      },
      {
        index: 1, kind: 'reply', now: at('2026-12-03', '16:20'), trigger: 'Odette Brandt replied on the thread.',
        add: { thread: [msg(o.from, at('2026-12-03', '16:04', 19), 'Wednesday the 9th at 10 works for me, see you then.')] },
        expect: {
          decisionClass: 'ask_bob', firstStep: ['record_yes', 'tell_bob'], tellBobMustMatch: 'hold|wait|back to it|paus|yes|wednesday', rulesInPlay: ['V2', 'V5', 'V6', 'V9'],
          bobDecides: [{ kind: 'goal', what: 'resuming the plan after Bob said hold off', settledBy: ['book', 'propose', 'ask'] }],
          basis: 'Odette\'s words are a yes to offered slot 842 (the accept rule: record_yes it). Bob put the plan on hold the day before, so resuming it (booking, or mailing her) is his: "Ask Bob only for a decision that is his." She records the yes and tells him, booking nothing.',
          notes: 'FOR BOB: wait (leaving the yes unanswered) is not accepted. Odette has a yes on the table that Bob does not know about, and "Nothing runs on this plan later unless someone writes or a follow-up is set": with nobody told, the yes sits until he happens to come back. The hold is on acting, not on telling him. A booking is V6 (and the class miss); a confirmation mail to Odette likewise.',
        },
      },
    ],
  };
  return { file, cal: { ...CAL, drop: ['2026-12-09T10:30'] }, checks: [{ at: '2026-12-09T10:00', durationMin: 30, free: true, why: 'Wednesday 10 (Odette\'s yes) is free', event: 1 }] };
};

/* ------------------------------------------------------------------ H6, the party's one time is a family blocker */
HELDOUT['h06-family-blocker'] = () => {
  const c = party('Caspian Reyes', 'caspian.reyes@oakhollow.example.org');
  const offers = [offer(851, '2026-12-08', '15:30', 30), offer(852, '2026-12-09', '14:15', 30), offer(853, '2026-12-10', '12:30', 30)];
  const now = at('2026-12-07', '09:40');
  const file = {
    ...base('h06-family-blocker', 'The party\'s one time is a family blocker: the offers do not work and the party names Friday at 2:30 as the one time this week; Friday 2:30 is under a family event of Bob\'s (dad), which is not hers to bump. One question to Bob naming it, or ask the party for next-week times; never book over it.', now, {
      id: 306, subject: 'Vendor intro', counterpart: c.address, parties: [c.address], partyNames: { [c.address]: c.name },
      askShape: weekCall(30, 'call', '30 minutes'),
    }),
    source: `${HELD}. Friday Dec 11 2:30 to 3:30 is the weekly pattern's "Family event 7 - dad" (busy, his; the thinning never drops family rows).`,
    review: { reviewed: true, answer: 'Bob, 2026-11-10: confirmed.', question: 'Caspian\'s only time is Friday 2:30, which is your family event (dad). Expectation: one question to you naming it, or asking him for next-week times; never booking over it. Agree?' },
    initial: {
      thread: [msg(BOB, at('2026-12-03', '16:10', 2), bobOpens('Could you find us 30 minutes the week of\nDecember 7 for an intro call?')), msg(WINNIE, at('2026-12-04', '09:31', 7), proposalMail('30 minutes with you on a Meet link', offers))],
      bob: [], links: {}, sent: [sentProposal(at('2026-12-04', '09:30', 28), [c.address], offers)], offered: offers,
    },
    events: [{
      index: 0, kind: 'reply', trigger: 'Caspian Reyes replied on the thread.',
      add: { thread: [msg(c.from, at('2026-12-07', '09:21', 50), 'None of those work, I\'m afraid. Friday at 2:30 is the one time I can do this week.')] },
      facts: [{ tool: 'check_calendar', args: { times: ['2026-12-11T14:30'], durationMin: 30 } }],
      expect: {
        decisionClass: 'ask_bob', alsoAccept: ['ask_party'], firstStep: ['record_no', 'tell_bob', 'ask'], tellBobMustMatch: 'friday|2:30|family|not free|busy', rulesInPlay: ['V1', 'NF', 'V5', 'V6', 'V9'],
        basis: 'The loop prompt\'s one-question rule: "A named time that is NOT free lists each blocker with its event id and whether it is bumpable. ... When he has not [said to bump it], tell_bob asks exactly ONE question naming the blocker and the party\'s other times ... A blocker that is not bumpable is named as not yours to bump, with its reason, and never offered as a bump." Caspian gave no other times this week; the blocker is Bob\'s family event.',
        notes: 'alsoAccept ask_party: asking Caspian for times the following week is within the rules. propose is NOT accepted: a proposal of next-week times would be outside the asked week (V3), and Bob\'s free times this week were already turned down. The misses: a booking at Friday 2:30 (NF), a bump of the family row, or a note that tells Caspian a story about why Friday does not work (the prose judge; the note rule says only "it does not work on Bob\'s side").',
      },
    }],
  };
  return { file, cal: { ...CAL }, checks: [{ at: '2026-12-11T14:30', durationMin: 30, free: false, why: 'Friday 2:30 is Family event 7 - dad' }] };
};
