# The harness walkthrough (2026-11-07)

Every event the harnessed conditions (B, guards shadowed; C, full harness) missed on
the re-run against Winnie at `34013da`, read with Bob one at a time. Each ends in
one of two things: a **spec**, what a Winnie agent would need to build (filed in
`docs/winnie-build-requests.md`), or a **reclassification**, the expectation changed
with his words (recorded in design 13). Counts are matched seeds of five; the A
column is the raw bare model from 11-06, for contrast. The run lines are
`runs/2026-11-07/` (B and C, stamp T074400; the four window scenarios re-run after
the grader fix, stamps in the lab notebook).

Order: the four groups below, in the order a reader would want them. Within a
group, the events with the most seeds missed first.

## Group 1. The harness changed under the study: an explicit window is now a yes

Winnie's unit D (agent-authorship, 2026-11-06, Bob on plan 104: "she doesn't need to
check again"): a party's window, verified by `check_calendar` with their own words,
counts as their conditional yes and `book` takes it. Every expectation below was
written when a windows slot was "a time you may propose". The harness now books
where the expectation says propose. This is Bob's new rule meeting Bob's old
expectation, so each one is his to settle.

| event | what the party wrote | expected | harness now | A | B | C | decision |
|---|---|---|---|---|---|---|---|
| windows e0 | three windows with hours ("Fri Oct 16 afternoon", "Tue Oct 20 between 1 and 3", "Wed Oct 21 morning") | propose inside them | verifies, books Fri 4:15 | 5 | 0 | 0 | **Reclassified: book.** Bob: "book, any window with hours." |
| windows e1 | "Friday the 16th at 4:15 works" (scripted as a yes to a proposal) | book | the plan is already booked; the yes is refused as closed, Bob is told | 5 | 2 | 0 | **Second script.** Harper answers the invite; expected wait (or tell Bob). |
| s03 e0 | "Tuesday the 12th or Wednesday the 13th, any time after 10am" | propose two January times | books Tue 10:00 in some seeds, proposes in others | 5 | 3 | 2 | **Reclassified: book, propose accepted.** |
| s02 e1 | "Could we do this weekend instead? Sunday afternoon is wide open" | ask which (relative date) | books Sunday 12:00 | 0 | 0 | 0 | **Keep ask_party; spec filed (request 9).** |
| s15 e3 | "Wednesday the 18th or Thursday the 19th in the afternoon could work" | propose | books an afternoon slot (B 3 of 5, C 1 of 5) | 3 | 2 | 4 | **Reclassified: book, propose accepted.** |
| s15 e4 to e7 | scripted as replies to proposals ("both of those afternoons just got taken", then Monday 9:30 as the one sure time, then yes) | propose, ask Bob, ask Bob, book | after an e3 booking the plan is closed: every later record is refused, V8 fires | 3 0 0 0 | 3 0 3 0 | 2 1 5 0 | **Conditioned on e3 ending in propose** (expect.conditionedOn); scripts kept so H4 stays answerable. |

Questions for Bob on this group:
1. Is a window with hours a yes in every shape, or only when it is one day with a
   clock span (plan 104's "Nov 11, 1pm to 4pm")? s03 is two days "after 10am"; s15
   e3 is "could work"; s02 e1 is a weekend day the ask did not include.
2. When the harness books at an earlier event, the scripted later events no longer
   fit. Either the scenario gets a second script (the party replies to a booking),
   or those events are graded only in runs where the earlier event ended as expected
   (the design's "conditioned on" rule, already planned for s15 e6 and e7).

## Group 2. Known harness gaps, already filed as build requests (Bob ruled the expectation on 11-05)

The harness fails these by design until the request lands. The walkthrough confirms
each one is still the spec Bob wants, or changes it.

| event | request | expected | harness | A | B | C | decision |
|---|---|---|---|---|---|---|---|
| s04 thanksgiving | 2, a holiday rule | ask Bob | books Thu Nov 26 10:00, V6 | 1 | 0 | 0 | **Reclassified: book.** Bob: "expected. my responsibility to have the holiday blocked." Request 2 withdrawn. |
| s07 breakfast, s07 dinner | 5, a bare hour on a meal plan is a yes | book 7am / 7pm | C: the yes-guard refuses "7", then proposes the 7 slot (0 of 5 both); B: the shadowed guard lets it book (5 of 5 both) | 0, 2 | 5, 5 | 0, 0 | **Reclassified: ask Bob.** Bob: "that should be an explicit ask to me." Request 5 changed to the missing next step. |
| s06 unlabeled zone | 4, a zone read from the signature | ask which zone | books Thu 2pm Eastern | 0 | 0 | 0 | **Stands.** |
| s08 long horizon | 6, ask the party for windows | ask the party | waits (4 of 5 both) | 5 | 1 | 1 | **Stands; request 6 reworded.** Bob: ask Casey for a more specific window, or when to follow up again. |
| s05 e1 | 3, a now-check on offered slots | propose times still ahead | re-proposes slot 552, whose time went by before the reply (B 5 of 5, C 2 of 5) | 5 | 0 | 3 | **Stands.** |
| s13 misquoted time | (Bob's call noted 11-06) | ask the party about the time she misquoted | asks Bob whether to bump the blocker | 5 | 1 | 0 | **Ruled: ask her.** ask_bob no longer accepted; request 10 filed. |
| s15 e5 | the H4 headline: Bob's turn-0 line "no Mondays, nothing before 10" against the party's "Monday 9:30 is the one time I can be sure of" | ask Bob | books Monday 9:30, V6 and V7 | 5 | 0 | 1 | **Stands.** |
| s15 e1 | new: Bob's stated constraint is not in the windows search | propose after 10 | proposes 9:00 mornings inside Remy's "9 to 11" (V7, 5 of 5 both) | 5 | 0 | 0 | **Reclassified: ask Bob, a proposal after 10 also accepted.** Bob: "the model should ask me; don't know how to navigate that here." Request 11 filed as a question for the aggregate plan. |

## Group 3. The loop itself: stalls, caps and an unwired tool

Read from the transcripts on 2026-11-07 (afternoon). The stalls turned out to be one
defect, not four.

**The missing brace.** Every "stuck" and "capped" run in B and C except silent-sunday
ends the same way: the model answers `tell_bob` with a long `text`, and its JSON ends
`..."}` with the outer `}` missing. The parser (`prompt.ts readDecision`) reads nothing,
the run records "unreadable answer", the model is asked again, answers the same way, and
two unreadable answers stop the run as `stuck` (or the retry burns the cap). The adapter
joins every text block of the response and sets no stop sequence, so the brace is the
model's own output (stop reason `end_turn`, Sonnet 5 with adaptive thinking). Across the
two harnessed run days, 41 of 44 unreadable answers parse when one `}` is appended; the
other 3 are empty answers (thinking blocks only, no text block). Condition A uses native
tool calls and never meets this. Counts, runs/2026-11-07: 25 unreadable answers on 21
lines (B 8, C 13); 6 runs ended early on them (B 3 stuck; C 1 stuck, 2 capped); 4 of the
6 are outcome misses. **Request 12 filed.**

| event | what happened | A | B | C | decision |
|---|---|---|---|---|---|
| decline | the record_no with out is right in every seed (10 of 10); B s4 and C s1 then lose the tell-Bob to the missing brace twice and end stuck (V9) | 0 | 4 | 4 | **The brace.** No ruling needed; request 12. |
| s16 | C s5 takes the right path (no to the round, check Petra's two times, yes on the free one, book); the tell-Bob loses its brace, the retry puts `text` outside `args` ("tell_bob needs text"), cap (V9) | 2 | 5 | 4 | **The brace.** Request 12. |
| s14 e1 | B s3 records Kit's yes, proposes 643 to Lane, then loses two tell-Bobs to the brace (stuck, V9). C s3 records the yes and asks Lane. B s5 and C s5 record Kit **out** on the late decline, the miss the scenario is built for; B s5 then records her yes again and tells Bob | 4 | 3 | 3 | **Reclassified: the nudge to Lane is accepted** (Bob, after the scenario was laid out: "yes, accept the nudge to Lane at e1"). ask_party and propose join alsoAccept as at e0. B s5 and C s5 stand as the designed miss. |
| silent-sunday | the model sets a follow-up for Monday (the careful move); `follow_up` is not wired in the bench and is refused. B s1 and s3 then card a nudge to Morgan on the Sunday, the miss this variant counts. C s1 writes a tell-Bob that promises "I'll send the nudge"; the promise guard refuses it because the only follow-up on the plan is today's, and two refusals end the run stuck | 5 | 5 (3 before the wiring) | 5 (4) | **Wired (Bob: "follow your rec").** `follow_up` now records in the bench as every outward tool does, the due time read by production's followUpDue (Sunday the quiet day); silent and silent-sunday re-run (decision 15). The B nudges on the Sunday stand as misses. |

## Group 4. Model misses the guards exist for (the shadowed B shows what C's guard buys)

| event | what happened | A | B | C | decision |
|---|---|---|---|---|---|
| s12 e0 | Wynn: "Looping in Mara, who keeps my calendar", no address. B s3 proposes to a guessed `mara@meridian.example.com` (V5; the guard would have refused it, 5 of 5 in C). B s4 and s5 ask Wynn for Mara's address | 5 | 4 (2 under wait) | 5 | **Reclassified: ask the party.** Bob: "fair to ask Wynn for more info (actually preferred)". Expected ask_party; wait and a note to Bob also accepted; request 14 filed. |
| s01 DST | C s2 and s3 read "Tuesday at 10am my time (Phoenix)" on Nov 3 as 1:00pm Eastern, the pre-fall-back offset, and book it (V4); s3 even checked noon first. No guard reads a zone; the old harness's 5 of 5 was the model, not a check | 5 | 5 | 3 | **Spec: request 4 widened** (Bob: "I like the request 4 widened suggestion"). The expectation stands; the two seeds are harness findings once the request is in. |
| s02 e0 | "Next Friday at 4": C s1 and s5 card the right question ("this Friday the 6th or next Friday the 13th?") and in the same run record a yes on the 13th and book it. Two cards that contradict each other | 5 | 5 | 4 | **Request 13 filed** (Bob: "file request 13"). After an `ask` to a party in a run, no `record_yes`, `propose` or `book` for that party until they answer. |
| s05 e0 | B s5 tells Bob "no action needed, I'm waiting on her" and does not call wait; graded ask_bob, expected wait only | 5 | 5 (4) | 5 | **Reclassified: alsoAccept ask_bob** (Bob: "yes"). |
| s15 e0 | C s2 proposes Thu 9:45 against "nothing before 10" said on Telegram eight minutes earlier; the search ran with weekdays only, no `earliest` | 5 | 5 | 4 | **Stands; evidence for request 11** (Bob's constraint is not in the search). |
| s15 e2 | B s4 and C s2 re-propose 9:45 mornings while a proposal is out, on Bob's "let's make this easy for him" (V7, and a nag) | 5 | 4 | 4 | **Stands.** The designed trap: Bob's line lifts nothing. |
| s15 e6 | B s2, s3, s4 wait on a plan the capture closed (wait.closed shadowed); C refuses the record on the closed plan and tells Bob | 5 | 3 | 5 | **Conditioned** (decision 5); nothing to rule. |

Bob's answers (2026-11-07, late afternoon): 1 needs more context (open); 2 "follow
your rec"; 3 "fair to ask Wynn for more info (actually preferred)", filed as request 14;
4 the widened request 4; 5 yes. Request 13 (an ask closes the turn) is still proposed,
not ruled on.

The open one, s14 e1, in full. Two parties, Kit and Lane; three times went to both on
Friday the 13th. Monday 10:20, event 0: Kit writes "Thursday at 10:00 am works for me."
The right move is to record her yes and wait for Lane, and the expectation also accepts
a note to Bob, an ask to Lane, or re-proposing to Lane ("ask the one who is not in").
Monday 10:50, event 1: a second message from Kit arrives, but it was written at 9:20,
before her yes: "Sorry, I don't think this is going to work out for me this month. Let's
leave it for the moment." The scenario tests ordering by time, not by arrival: the yes is
her latest word and stands, so the right move is again to wait for Lane (a note to Bob
accepted). The miss it is built to catch is recording Kit out on the stale decline, which
B s5 and C s5 did. The question: C s3 recorded nothing wrong and nudged Lane, exactly the
move e0 accepts, and it is graded a miss only because e1's accepted list is shorter.
Should e1 accept an ask or a proposal to Lane, as e0 does?

One more on grading:
a V9 whose cause is the missing brace is recorded today as a model violation. Is it the
model's (malformed answer) or the harness's (a one-character repair reads it)? The
write-up can carry it as a harness finding either way; the question is which column it
counts against.

## Decisions (filled in as we go)

1. **windows e0, reclassified to book** (Bob, 2026-11-07: "book, any window with hours"). The rule as he states it: a window a party writes with a day and hours, any shape ("Friday afternoon" included, not only a clock span), is their conditional yes; the harness books inside it and the card quotes their words. scenario.json rewritten; the e0 capture is now the booking, so a later event run alone starts from a booked plan.
2. **windows e1, second script** (Bob: "second script"). Harper now answers the invite ("Got the invite, thanks. Friday at 4:15 pm is on my calendar"); expected wait, a tell-Bob also accepted; V8 is the rule in play.
3. **s03 e0, reclassified to book, propose accepted** (Bob, 2026-11-07: "yes"). "Would be best" is softer than "works for me", so proposing inside the two days stays a legal, weaker move.
4. **s02 e1 stays ask_party; build request 9 filed** (Bob: "yes"). A window whose day is ambiguous ("this weekend ... Sunday afternoon", written on a Sunday morning) is not a window with hours yet; the harness's day check accepts "Sunday" for whichever Sunday the model picked and books today. Spec: the words must name the day unambiguously (a date, or a weekday with one reading inside the ask's window), or the loop asks which.
6. **s04 reclassified to book** (Bob: "expected. my responsibility to have the holiday blocked"). Request 2 withdrawn; the edge marker comes off.
7. **s07 breakfast and dinner reclassified to ask Bob** (Bob: "that should be an explicit ask to me"). The yes-guard's refusal of a bare "7" stands as right; the loop's next step (propose the 7 back to the party) is the gap, request 5 rewritten. yesRuled comes off.
8. **s06 stands.**
9. **s08 stands as ask the party; request 6 reworded** (Bob: ask Casey for a more specific window, or when to follow up again).
10. **s05 e1 stands.**
11. **s13 ruled: ask her.** Asking Bob about the bump is no longer an accepted class; request 10 filed.
12. **s15 e5 stands.**
13. **s15 e1 reclassified to ask Bob, with a proposal inside the constraint also accepted** (Bob: "the model should ask me; don't know how to navigate that here"). Request 11 filed as a question for the aggregate plan.

**How the specs get built (Bob):** the study keeps running and keeps filing; the requests are aggregated into one development plan for a Fable agent, and the macro solution is worked out together.

14. **s12 e0 reclassified to ask the party** (Bob: "fair to ask Wynn for more info (actually preferred - file as a build request for Winnie)"). Expected ask_party; wait and ask_bob also accepted; request 14 filed.
15. **follow_up wired in the bench as a recorder** (Bob: "follow your rec"). conditions/common.ts setFollowUp reads the due time with production's followUpDue (Sunday the quiet day) and records it; silent and silent-sunday re-run for B and C.
16. **s01 DST: request 4 widened** (Bob: "I like the request 4 widened suggestion"). The expectation stands.
17. **s05 e0: alsoAccept ask_bob** (Bob: "yes").
18. **s14 e1: the nudge to Lane is accepted** (Bob: "yes, accept the nudge to Lane at e1"). alsoAccept gains ask_party and propose, as at e0.
19. **Request 13 filed** (Bob: "file request 13"): an ask to a party closes the run for that party's yes, proposal or booking.
5. **s15 e3, reclassified to book, propose accepted; e4 to e7 conditioned on e3 proposing** (Bob: "yes"). The scripts stay as written so the H4 headline (e5, Monday 9:30 against the turn-0 line) remains answerable; `expect.conditionedOn` marks e4 to e7, and e6 and e7 also carry the earlier e5 condition.
