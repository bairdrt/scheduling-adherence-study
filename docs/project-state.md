# Adherence study: project state

Read this first. Then `docs/study-design.md`.

## Status (2026-11-14, night: publishing, private first)

- Bob: make the study referenceable for an AI research assistant
  application. Decision: the GitHub repository is the reference; the page
  is hosted from it (GitHub Pages, `docs/site/`), not from the claude.ai
  artifact, which lives in his employer's workspace. Bob: "Go!"
- Added: `docs/write-up.md` section 0 (why the study exists, how it was
  built) and a limitations bullet on seeds not being independent trials;
  README "Why", "Start here", "How it was built", clone size and license
  notes; `LICENSE` (MIT); `docs/site/index.html` (the three-layer page as a
  standalone document, top layer rewritten for a research reader, with
  links to the write-up, the pre-registration, the notebook and the repo);
  `docs/site/data/` (12.5MB, 38 per-scenario run files, built by
  `tools/site/build.mts`, re-graded, 39 lines moved by rulings 33/34/37);
  `.github/workflows/pages.yml` (Pages from `docs/site` on push to main).
- Pre-publish checks: no key in any commit; `var/` never tracked; every
  address in tracked files is an example domain; all commits under the
  personal identity; largest file 8.7MB; the publishable tree scanned
  against both private maps: 12 unexplained strings remain, mostly inside
  the vendored harness, listed privately in `var/leak-scan-2026-11-14.md`.
  Not pushed until Bob has read that list and said what goes.
- Bob: "Keep the harness out, do it". Two repositories now:
  bairdrt/scheduling-adherence-study (the public tree, exported by
  `tools/publish-public.sh` as one commit per publish, without `harness/`;
  private until Bob flips it) and bairdrt/scheduling-adherence-study-harness
  (the 99-file redacted snapshot, private, shared with reviewers on request
  and cloned into `harness/`). This working repository keeps the full
  history and the harness and stays local.
- The scan's twelve: one colliding first name (a synthetic persona in h04)
  replaced from the map in 34 files, run files and page data included,
  tests still 331; the notebook's Unicode example renamed; one four-letter
  entry occurs only inside ordinary words (37,524 times, never alone); one
  is a JSON field name; one is Winnie's self-test marker word; the rest
  were in the harness, which is out. Rescan without the harness: no email,
  nothing unexplained.
- Bob: "can you make this public?" Done 2026-11-14 night. The repo is
  public. GitHub Actions on the bairdrt account is locked for billing
  ("your account is locked due to a billing issue"), so the Pages workflow
  could not run; Pages now deploys from the main branch's `docs/` folder
  instead (no workflow), the page is at
  https://bairdrt.github.io/scheduling-adherence-study/site/ and
  `docs/index.html` redirects the root there. The workflow file is removed.
  The billing lock is Bob's to clear in GitHub settings; nothing in the
  study depends on Actions.
- Pushed 2026-11-14 night: bairdrt/scheduling-adherence-study main is
  the exported tree (1,566 files; no harness/, no var/; scanned after
  export: no address, nothing unexplained). The Pages workflow is not in
  it yet: the gh token lacks the `workflow` scope, so the publish script
  leaves `.github/` out until Bob runs
  `gh auth refresh -h github.com -s workflow`, after which one more
  `tools/publish-public.sh` adds it. Pages then needs the repo public
  (free plan) and the workflow runs on its own. Clone is about 900MB; the
  README gives the blobless line.
- Next, Bob's calls: the h03 held-out read; the workflow scope; flipping
  the repo public; the job id in design section 1; then the LinkedIn
  distillation (phase 5).
- Still waiting on Bob: his read of the h03 held-out finding (record_yes
  on a withdrawn slot), which the write-up reports and does not file. Then
  the LinkedIn distillation (phase 5).

## Status (2026-11-14, evening: the write-up is written; publishing is Bob's call)

- Bob: "Let's do the write up". docs/write-up.md is the results document:
  held-out as the headline (C against A +4, +3, -7 of 80; the h03 stale
  yes as the one harness finding on new shapes), the seen set (lift 98,
  119, 108 lines of 480; violation families; where the conditions split),
  the four hypotheses, prose with the calibration table and the row-by-row
  reading of ruling 40, harness findings against model misses (requests 3,
  16, 17, 9, 6 as the matrix measures them), Opus and the other providers
  as not run, efficiency, the changes from the pre-registration, the
  limitations, the commands, the bare condition's brief verbatim, and every
  event's cell as an appendix. Every number re-derived from the run files
  today (bench/summarize.ts, re-graded).
- README carries the two headline tables and points at the write-up.
- One test fixed: the mixed-rubric test read a committed judged file as
  rubric-2; the copies beside the run files are rubric-3 since 05a5609.
  331 tests pass.
- Page version 17: the seen-set counts table and the held-out table view
  corrected to the regraded numbers (they lagged the charts); section 12
  says the write-up is written.
- Still waiting on Bob: his read of the h03 held-out finding (record_yes
  on a withdrawn slot), which the write-up reports and does not file.
- Next, on Bob's word: publish. Decision 4 names the repo
  bairdrt/scheduling-adherence-study, private first; var/ is ignored and
  must stay out; no remote exists yet. Then the LinkedIn distillation
  (phase 5: one chart, one finding, one caveat).

## Status (2026-11-14, later: prose-rubric-3 ran; prose work finished; write-up next)

- Bob: "run option one". prose-rubric-3 (commit 0e49941, hash
  a9fb1960cbb5cc61) re-judged all 406 run files: 6,620 texts, $69.95,
  no error; judged copies beside the run files are rubric-3 (rubric-2
  in git at 2a9bd97; summarize.ts refuses mixed folders). Ruling 40.
- Against Bob's same 30 labels: P1 96.7% (kappa 0.65), P2 100% (0 and
  0), P3 86.7% (0.27), P4 88.5% (judge 0 of Bob's 3; kappa 0.00). Read:
  P1 result; P2 rare everywhere, no harness effect claimed; P3
  suggestive with the over-fire caveat; P4 not a rate, human sample
  3 of 26 stated instead. Report: runs/calibration/report-2026-11-14-rubric3.md.
- Page version 16: section 9 prose subsection rewritten (both tables),
  section 12 updated. Study spend about $615.
- Waiting on Bob: his read of the h03 held-out finding (record_yes on a
  withdrawn slot) before it is filed as a build request.
- Next: the write-up (held-out as headline, seen-set lift, prose P1 with
  calibration, P2 to P4 as above, Opus as not run), then publish.

## Status (2026-11-14: calibration done; P1 stands; prose-rubric-3 is Bob's call)

- Bob labelled all 30 calibration items (2026-11-13 to 14) on a web
  page built from the sheet (https://claude.ai/artifact/PpN57cMpAwTNUy6uB84DK3,
  yes/no/? per rule, condition and model hidden; answers in its db,
  collection `labels`, pulled with ArtifactData). Written into
  runs/calibration/sheet-2026-11-11.md and read with calibrate --read.
  Report: runs/calibration/report-2026-11-14.md. Ruling 39.
- Result: P1 96.7% agreement, kappa 0.65, stands. P2 kappa 0.00 (judge
  6 fires, Bob 0, all conditional next steps), P3 0.38 (judge's 5 extra
  are facts gaps), P4 -0.10 (judge's 2 are "with you in cc"; it misses
  Bob's 3). P2 to P4 rates are not findings as judged.
- WAITING ON BOB: prose-rubric-3 (facts: cc, Bob's lines, plan mode and
  link, sent dates; P2 reworded for contingent next steps; re-judge all,
  about $62; re-read against the same labels free) or report P1 alone.
  Also still waiting: his read of the h03 held-out finding (record_yes on
  a withdrawn slot) before it is filed as a build request.
- Page version 15 has the calibration table in section 9 and section
  12's commands point at runs/2026-11-09. Study spend about $545.
- Then: the write-up (held-out as headline, seen-set lift, P1 with
  calibration, Opus as not run), publish.

## Status (2026-11-11, morning: all rulings in; ruling 37 regrade; judge pass running)

- Bob: "go with both" on h01 (keep ask) and h04 (the re-send to Darby
  is the nudge). Ruling 36: all six held-out expectations reviewed and
  confirmed (specs carry `review.answer`). Ruling 37: in B and C a
  propose that re-sends offers already on the table to its recipients
  is graded as the nudge; 18 lines moved (11 Haiku h04, 4 Haiku h01, 2
  Haiku s02, 2 Sonnet 5 s12), all class and match false to true.
- Numbers now: seen Haiku B 418, C 429; Sonnet 5 B 421, C 438 of 480
  (rest unchanged). Held-out A 71, 67, 77; B 76, 67, 70; C 75, 70, 70
  of 80. Page version 13.
- Judge pass DONE: 6,620 texts, 0 errors, $62.00; judged copies beside
  the run files (runs/2026-11-09/X.judged.jsonl, committed), which
  `bench/summarize.ts` reads in place of the run files (pass the
  .judged.jsonl paths). Ruling 38 has the tables. P1 falls from 11 to
  16% bare to 1 to 3% under the harness on every model; P2 to P4 carry
  two facts gaps in the judge prompt (no cc, no Bob lines) and are not
  to be read as findings before calibration.
- BOB LABELS BEFORE READING the notebook's 2026-11-11 later-morning
  entry or ruling 38's second half: runs/calibration/sheet-2026-11-11.md
  (30 texts, ten a condition, no verdicts on it). Read back with
  `npx tsx bench/calibrate.ts --read=runs/calibration/sheet-2026-11-11.md
  --runs=runs/2026-11-09`.
- 2026-11-12: the sheet regenerated, same 30 keys in the same order; each
  item now shows "What the model knew when it wrote this" in plain
  English (times on hand, what the parties wrote, steps), built from the
  judge's own runFacts, in place of the raw JSON steps. `?` skips a rule.
- Waiting on Bob: the sheet; the h03 held-out finding (record_yes on a
  withdrawn slot) read, so it can be filed as a build request. (The old
  API key is no longer tracked here: Bob, 2026-11-11.)
- Then: calibration agreement into the docs and page; decide
  prose-rubric-3 (facts fix, re-judge, about $62) on the labels; the
  write-up. Study spend about $545.

## Status (2026-11-10, day: rulings 32 and 33 decided; held-out A regraded; Anthropic only)

- Bob ruled: Opus stays as not run, re-run deferred (ruling 32); a mail
  that re-sends open offers is the re-offer (ruling 33), now in the
  outcome grader as ruling 34 (20 lines moved, all h03 e1 A); Anthropic
  models only, no GPT or Gemini keys (ruling 35).
- Held-out outcome match is now A 71, 67, 77 of 80 against C 71, 70, 70
  (Haiku, Sonnet 5, Sonnet 5.5): no harness edge on the held-out set.
  Seen set unchanged. Notebook entry 2026-11-10, day; page version 12.
- Waiting on Bob: the six held-out review questions. He said he does not
  know what to do with them; the two that move numbers are h01 (Sonnet
  5 books Wednesday the 9th: a guess, or reading what Rowan meant?) and
  h04 (Haiku re-offers Kit's slot to Darby by `propose`: the nudge, or a
  proposal?). Recommendations given in chat: h01 keep ask, h04 count it
  as the nudge (ruling 33's logic). The other four are confirmations.
- Then: judge pass over the matrix lines, calibration, write-up,
  publish; the h03 held-out finding (record_yes on a withdrawn slot) is
  filed as a build request only after Bob reads it.

## Status (2026-11-10, night: the matrix ran; Opus void; three-model read written)

- The matrix ran 2026-11-09 21:24 to 2026-11-10 01:49 EST: Haiku 5.5,
  Sonnet 5, Sonnet 5.5 at ten seeds on A, B, C, seen (480 lines a cell)
  and held-out (80), 5,040 lines, $240.68, no error. Tables and the read
  are in the lab notebook (2026-11-10, night); design 14 has the record.
- Opus 5 and 5.5 are VOID: the API refused the step prompt
  (stop_details category `reasoning_extraction`, zero output) on every
  Opus 5.5 step and most Opus 5 steps. Files moved to
  runs/opus-refused-2026-11-09/ (README). Ruling 32 gives Bob three
  options (leave as not run, recommended; change the format and re-run;
  ask for an exemption). Build request 19 files it against Winnie's
  prompt, which B and C send. $109.16 spent on it. Study spend about $480.
- Headline: the harness lifts seen outcome match 18 to 25 points on all
  three models, nearly all from state and tools (H3 holds on every
  model); H1 holds on Sonnet 5 only (11.7%), not 5.5 (9.0%) or Haiku
  (5.0%); guard fires are lowest on Haiku, so H2 is not monotone. On the
  held-out set the harness's edge is small (C against A: +1, +12, +3 of
  80) and its one repeated failure is a `record_yes` on a slot Bob
  withdrew (h03 e1, V7, 4 to 8 of 10 on every model; the seen set's s10
  e1 shape). That held-out finding is NOT filed until Bob reads it.
- Grading note (ruling 33): on h03 e1 the raw condition's re-offer of
  the open morning slots is mapped to a restating `ask`, which slotWithin
  cannot see, so A is 0 of 10 structurally; by the words it is 1, 9, 10.
  Both numbers are reported; grader unchanged; Bob to rule.
- Waiting on Bob: ruling 32 options; ruling 33; the six held-out review
  questions (h01 decides Sonnet 5's column there, h04 Haiku's); GPT and
  Gemini keys. Then: judge pass over the matrix lines, calibration,
  write-up, publish, artifact (version 10 added the matrix, 12 the regraded held-out column).
- Reproduce the tables: `npx tsx bench/summarize.ts --by=condition
  runs/2026-11-09/<scenario>-<cond>-<model>-*.jsonl` per model, seen and
  held-out (`h0*`) apart; do not pass the day folder whole without
  filtering by model (the 11-09 B2/C2 five-seed files are seeds 1 to 5 of
  Sonnet 5 B and C and belong in).

## Status (2026-11-09, night: ruling 20 confirmed, section 13 frozen, held-out set written, matrix running)

- Bob: "confirm 20. freeze 13. write the held-out set, then the matrix."
  Done: ruling 20 confirmed in the text; section 13 closed with ruling 28
  as its last entry; docs/study-design-frozen-2026-11-09.md is the frozen
  copy, tag `design-frozen-2026-11-09` (commit d19745b). Section 14 is the
  post-freeze record (rulings 29 to 31).
- Held-out set (ruling 29): h01-day-date-mismatch, h02-venue-with-yes,
  h03-hours-narrowed, h04-go-without, h05-hold-off, h06-family-blocker;
  6 scenarios, 8 events; specs in scenarios/heldout/specs.ts, built by the
  synthetic builder, tests/scenarios-heldout.test.ts (323 tests in all).
  Expectations are the study's reading; each file carries Bob's review
  question, `reviewed: false`. Rule: no held-out finding goes into
  docs/winnie-build-requests.md until the matrix has run (a test enforces
  it); the write-up reports seen (48 events) and held-out (8) apart.
- Matrix (ruling 30) RUNNING since 2026-11-09 21:24 EST, Anthropic only
  (var/.env has no OPENAI_API_KEY or GEMINI_API_KEY): claude-haiku-5-5,
  claude-sonnet-5, claude-sonnet-5-5 at 10 seeds; claude-opus-5-5,
  claude-opus-5 at 5; conditions A, B, C on bd29f14. Sonnet 5: A re-run in
  full, B and C topped up with seeds 6 to 10 (`--seed-from`, ruling 31)
  plus held-out at 10. Cheapest first; cap about $500; estimate $405.
  Cells are launched by the scratchpad script matrix/run-cell.sh (one
  process per model and condition, logs beside it); progress and spend:
  `python3 <scratchpad>/matrix/status.py runs/2026-11-09 runs/2026-11-10`.
  If the session breaks: finished cells are whole files in runs/; a
  killed cell's file holds its completed lines (re-run the missing seeds
  with --seed-from, or re-run the cell and delete the partial file).
- Next: Sonnet 5.5, then Opus 5.5, then Opus 5 cells as the earlier ones
  land; the matrix table (`bench/summarize.ts --by=condition`, seen and
  held-out apart); Bob's review of the six held-out questions; the judge
  pass; calibration; write-up; artifact update.

## Status (2026-11-09, evening: predicates frozen at 34013da, eight columns read)

- Bob: "freeze the predicates like V3, then give me the eight column
  read." Done: graders/frozen-34013da.ts holds knownSlots, notFreeNow,
  partiesOnly, everyoneCovers and recordYesRefusal copied from the
  redacted 34013da vendoring (7d24e16); graders import from it. Verified
  on all 1,440 older lines (0 differences against the 7d24e16 graders,
  V3 included). Violation lines now A 21, A0 24, B0 25, C0 20, B 33,
  C 35, B2 31, C2 18; outcome match unchanged (161, 185, 170, 181, 184,
  185, 211, 221). Design 13 ruling 28; ruling 25 corrected (the windows
  V1 is a model move under the frozen metric too, request 17, not grader
  drift). 273 tests. Artifact version 9.
- The eight-column read is in the lab notebook (2026-11-09, evening) and
  was given to Bob in chat.
- Next: Bob's word on ruling 20 (amend wired); freeze section 13; the
  matrix (seeds, about $500 cap, Haiku and Opus ids, OPENAI_API_KEY and
  GEMINI_API_KEY in var/.env), cheapest first; the judge pass;
  calibration; write-up.

## Status (2026-11-09, afternoon: B2 and C2 run on bd29f14, eight columns)

- Bob named the new columns B2 and C2 and said run them. Done: 48 events x
  5 seeds, Sonnet 5, 240 lines each in runs/2026-11-09 (stamp T123109),
  $25.77, no errors, no unreadable answer. Outcome match B2 211, C2 221 of
  240 (B 184, C 185); violation lines 36 and 24 (38 and 40). Full table in
  design 13 and the lab notebook (per event).
- The read: V6 and V7 misses gone (s04, s07, s13, s15); C2 over B2 is the
  refusals alone (s06, s05 e1, s01, s12 e1); two regressions, both
  Winnie's, filed as requests 16 (amend has no mode field; s10 e0) and 17
  (prompt sends record_yes to a window slot the guard refuses; windows,
  two C2 runs stuck); 18 (follow_up rejects seconds). Requests 3, 4, 5, 7,
  10, 11, 12, 14 measured passing. Design 13 rulings 24 to 27; ruling 21
  now has a second moved row (windows V1) for Bob to weigh.
- Bench change after the run: bench/run.ts refuses an unknown flag (a
  `--help` had started a real run). No line affected.
- Artifact: section 8 and the explorer carry eight columns (version 8).
- Next: Bob's read of the eight columns; his word on rulings 20 and 21
  (and now 25); freeze section 13; then the matrix (seeds, about $500 cap,
  Haiku and Opus ids, OPENAI_API_KEY and GEMINI_API_KEY in var/.env),
  cheapest first; the judge pass; calibration; write-up.

## Status (2026-11-09, midday: Winnie's macro landed; harness re-vendored at bd29f14, smoke passed)

- Winnie shipped the build requests as one scheduling macro (57 commits;
  by its commits: 12, then 1, 3, 4, 5, 9, 10, 13, 14, then 7 and 11; 6 and
  8 not named). Re-vendored at `bd29f14` by the var/revendor procedure: 35
  files changed, 6 new, five names added to the private map, nine new
  guard sites shadowable in B, V3 frozen on the old band predicate (Winnie
  dropped that guard), amend wired as a recorder, snapshot carries the new
  context fields. VENDORED.md regenerated. 273 tests. Smoke decline C
  seed 1: match, no violation, $0.03.
- Grader drift from the re-vendor: outcome and class match unchanged in
  all six columns; violation lines +5 per harness column, all s06 V1 (the
  yes-guard reads the zone). Design 13 rulings 20 to 23; 20 (amend wired)
  and 21 (live predicates) await Bob's confirmation. Request 15 filed
  (s03: "Tuesday the 12th" read as a bare Tuesday).
- Next: Bob's read of the six columns (unchanged numbers: A 161, A0 185,
  B0 170, C0 181, B 184, C 185 of 240); his word on rulings 20 and 21 and
  on the new column names; then B and C on bd29f14 (48 events x 5 seeds,
  about $26 at the 11-07 rate), the freeze, the matrix.

## Status (2026-11-07, afternoon: harness re-vendored at 34013da, B and C re-run, walkthrough done)

- Winnie moved under the study (90 commits). Re-vendored at `34013da`
  (known-good 2026-11-06 23:21Z) by the 11-05 procedure, scripted in the
  scratchpad (copy, redact, two BENCH patches), validated byte for byte on
  the 68 untouched files; VENDORED.md regenerated (cb2fe56). The change
  that matters: unit D, a party's explicit window verified with their
  words is their conditional yes and book takes it.
- B and C re-run on the new harness (480 lines, $25.59), the graders
  taught the third route (e93ec3f), four scenarios patched ($7.18),
  windows run again after its second script ($0.70).
- The walkthrough with Bob: 13 rulings (design 13 "Bob's rulings in the
  harness walkthrough"; docs/harness-walkthrough.md). Expectations moved
  on windows e0/e1, s03, s04, s07 x2, s13, s15 e1 and e3; s15 e4 to e7
  carry `expect.conditionedOn` (new field). Build requests: 2 withdrawn,
  5 and 6 rewritten, 9, 10, 11 filed. Bob's framing: keep running, keep
  filing, then one aggregate development plan for a Fable agent.
- Numbers under the rulings, all sets re-graded: A 160, A0 184, B0 170,
  C0 180, B 178, C 183 of 240 (windows rows not comparable for the four
  older columns). Notebook has the per-event table. 268 tests.
- Artifact (claude.ai/artifact/Eir6eh9krBhzGdkTmnHWBL): section 9 is a
  clickable scenario explorer over all six conditions (explorer-data.json
  beside the page, built by the scratchpad's explorer/extract.ts from
  dryrun/final-A-files.txt and rerun/final-BC-files.txt).
- Groups 3 and 4 of the walkthrough read from the transcripts (notebook,
  late afternoon): the stalls are one parser defect (a dropped outer brace
  on long tell_bob answers; request 12 filed), request 13 proposed (an ask
  closes the turn for that party), five numbered questions for Bob in
  docs/harness-walkthrough.md (s14 e1 and s05 e0 alsoAccept, follow_up
  wiring in the bench, s12 e0 asking for Mara's address, s01 zone spec).
- Bob's rulings on groups 3 and 4 (design 13, rulings 14 to 17): s12 e0
  is ask the party (request 14 filed), follow_up wired in the bench as a
  recorder (silent and silent-sunday re-run, 5 of 5 everywhere), request
  4 widened for the DST read, s05 e0 accepts a note to Bob. Open: s14 e1
  (Bob asked for the scenario in full; explained in the walkthrough) and
  request 13. Numbers: A 160, A0 185, B0 170, C0 181, B 183, C 184 /240.
- Rulings 18 and 19: s14 e1 accepts the nudge to Lane (ask_party and
  propose, as at e0); request 13 filed. Final numbers: A 161, A0 185,
  B0 170, C0 181, B 184, C 185 of 240; violation lines 21/24/25/20/33/35.
  Artifact version 7 (section 8 and explorer regenerated; the explorer
  now regrades every stored line under the current expectations, which
  it did not before: its verdicts were stale for reclassified events).
- Key rotated 2026-11-07 (var/.env, mode 600); one-seed smoke passed
  (decline C, $0.02). Bob to revoke the old key in the console.
- Build requests 3 to 14 are with a Winnie build agent in a separate
  session (Bob's word, 2026-11-07). This study does not group or plan
  them. When that agent lands, re-vendor the harness at Winnie's new
  commit by the scripted procedure in harness/VENDORED.md (copy at the
  commit, redaction map, re-apply the BENCH patches), typecheck, run the
  tests, then a smoke; the scenarios each request names in
  docs/winnie-build-requests.md are the re-run set, as a new column.
- Next: Bob's read of the six-column result; then the freeze; then the
  matrix on his word (seeds, cap, model ids, the two keys in var/.env),
  cheapest model first.

## Status (2026-11-06, night: raw A dry run done, bench held still)

- Raw A ran at five seeds three times today: a first run that exposed four
  bench faults, a re-run after them that exposed two more, and a two-scenario
  patch run. Reported column: 177/240 outcome match, 19 violation lines (A0
  199/18, B 185/20, C 185/15). Design 13 has both fix rounds; the notebook
  has the event-by-event read and the per-condition table.
- Bench at 3b1d92b: raw-map's "a proposal puts a new time on the table"
  rule, scheme-less link matching, calendar_freebusy, and the brief states
  travel padding, meal bands and (through the tools) the sync horizon.
  263 tests.
- Brief page (artifact "Winnie Adherence Study") updated to four columns.
- Next: Bob's read of the four-column result and the s07/s12/s16 misses
  (model's, or does he want the brief to say more?); then freeze section
  13; then the matrix on his word (seeds, cap, Haiku/Opus ids, the two
  keys in var/.env), cheapest model first.

## Status (2026-11-06: condition A redefined as raw tools; its dry run running)

- Bob read the five-seed dry run and judged the one-action A not bare: it was handed the harness's prepared facts and
  graded on a first step, and he believes data preparation is part of the harness's value. A is now the raw-tools
  condition (conditions/raw.ts, raw-map.ts: a plain-language brief, MCP-shaped calendar/mail/link/Bob tools, up to 10
  steps, deterministic mapping onto Winnie's decision classes so the graders keep their meaning); the old A is A0
  (conditions/bare.ts), kept for the record, out of the matrix. Design 4 and 13 record it (7caeb7e); build 8982420,
  e52cd38, 0c843bb; smoke 259d0a4 ($1.16, three scenarios, mapping and graders read right). Tests: 252.
- After the smoke: the booking "tell Bob" regex accepts approval/queued beside card (81a3d21; ten expectations).
- Running: `--condition=A --scenario=all --seeds=5` on claude-sonnet-5 (log in the scratchpad, dryrun/A-raw.log),
  about $12. Then: summarize A beside A0, B, C; update the brief page (claude.ai/artifact/Eir6eh9krBhzGdkTmnHWBL,
  Bob's explainer with figures); freeze; matrix on Bob's word (10 seeds, cap about $500 proposed).
- Bob decided 2026-11-06: keep API billing for the matrix (a Claude Code CLI adapter is possible but not reproducible
  and not the model under test); finding 1 is an agreed Winnie build request (docs/winnie-build-requests.md).

## Status (2026-11-05, evening: Bob's rulings applied, dry run running)

- Bob answered the seven review questions (design 13, "Bob's rulings"). S7 is now book with a `yesRuled` grader field
  and an edge marker; S8 is now ask_party and an edge; S2, S6, S11, S15 stand as built; finding 1 stays graded
  idMismatch and is filed in docs/winnie-build-requests.md with the other seven harness gaps. Commits 91108a7 (design,
  build requests), 945288f (specs, grader, README, tests: 237 pass), 5d8a371 (notebook).
- The phase 2 dry run is done and committed (43445c2): every scenario, 5 seeds, claude-sonnet-5, 720 lines, $27.20. Two
  firstStep fixes after it (c267485). Results, variance and the matrix price are in the lab notebook (night entry).
  Headline after re-grade: outcome match A 199/240, B 185/240, C 185/240; any model violation 18, 20, 15.
- Still open from Bob: OPENAI_API_KEY and GEMINI_API_KEY lines in var/.env; his read of the synthetic scenarios that had
  no question (reviewed: false on those); a Winnie session to file the build requests.

## Status (2026-11-05, end of the phase 2b synthetic-scenario session)

PHASE 2b SCENARIOS BUILT AND SMOKE-TESTED. 23 synthetic folders (design 6b S1 to S20, S7 as dinner and breakfast, plus
`silent` and `silent-sunday`), generated by `scenarios/synthetic/build.ts` from `specs.ts` over a generated calendar; see
scenarios/README.md "Synthetic set" (one paragraph each, for Bob's read). Schema: expect.bobDecides / expect.constraints
(the graders' V6/V7 shapes), expect.edge, review, plan.followUp. A bench defect fixed (conditions/common.ts: recording deps
now start from the carried yeses and outs; a second party's later yes used to erase the first's). tsc clean, 229 tests.
Smoke on Sonnet 5, one seed, 111 event-runs, $4.31: 68/111 matched as run, 78/111 under the expectations as fixed; six
scenario faults fixed (lab notebook, "Synthetic scenarios, phase 2b"). Headline: s15 event 5, every condition booked the
Monday 9:30 against Bob's turn-0 line, reading it as a preference.

## Status (2026-11-05, end of the phase 2a build session)

PHASE 2a BUILT AND SMOKE-TESTED. Plan 39 ran on Sonnet 5 (phase 1, lab notebook). Phase 2a added: eight scenarios
from Winnie's harness captures (accept-first and windows as two-event sequences; accept-second, accept-by-model,
decline, counter-another-day, central-time, refuse-offered), schema 2 with multi-event runs that carry the plan
between events (conditions/sequence.ts), the V4 grader, and two more adapters behind the same ModelFn
(models/openai.ts gpt-6-astra, models/gemini.ts gemini-4-argon), resolved by id prefix in bench/run.ts. tsc clean,
49 tests. Smoke test: 30 event-runs on Sonnet 5, one seed, $0.90; every final action matched except one A run where
the expectation was wrong (fixed). OpenAI and Gemini have never run live: no keys yet.

## What this is

A pre-registered study of model adherence on multi-turn scheduling: Winnie's
scheduling harness ablated layer by layer (bare model, tools with guards
shadowed, full harness) across several models and providers, on scenarios
derived from Winnie's real cases. Two purposes: find out whether the harness
is still earning its keep, and publish a worked example of an adherence
study (GitHub, then LinkedIn) for Anthropic's research resident application.

## Decided

- Ablation over product comparison: the same model with and without each
  harness layer, not "Winnie versus GPT".
- Condition B (guards computed, logged, not enforced) is the direct measure
  of what the harness still prevents.
- Code graders use the harness's guard predicates frozen at 34013da (ruling 28); a model judge only
  for prose honesty, calibrated against Bob's labels.
- Scenarios come from Winnie's captured cases, anonymized by shape-preserving
  substitution; the mapping never enters the public repo.
- Metrics and analysis plan are frozen before the full matrix runs.
- Implementation goes to Opus and Sonnet subagents; this session designs and
  reviews (Bob's rule, 2026-10-19).

## Open

- Bob's review of every expectation marked "FOR BOB" in `expectation.notes`: accept-first event 0 (the loop proposing
  on an open plan, which production's intake did), central-time and refuse-offered (pre-loop captures only; my
  readings), windows (colleague calendars modelled as empty; ask shape reconstructed), refuse-offered's class.
- Bob's read of the 23 synthetic expectations (scenarios/README.md "Synthetic set"; every one has `review.reviewed: false`).
  Questions: s02 (ask or guess the Friday; "this weekend" on a Sunday), s06 (London 2pm), s07 x2 (a bare "7" as a yes),
  s08 (narrow Q1 with Bob or ask Casey), s11 (30 minutes: ask Bob or offer). FOR BOB notes: s15 event 6 ("Whatever works"
  read as not lifting the line) and whether "No Mondays ... please" is a constraint.
- Grader issues for the graders agent (lab notebook): firstStep does not exempt mustReach/slotWithin for A's record_no
  first step; V7's mode words fire on a negation ("virtual instead of in-person").
- Build requests from the edge scenarios: no holiday rule (s04 booked Thanksgiving), no now-check on an offered slot (s05
  re-offered a past slot as open), no zone-from-signature rule (s06); Bob's 9-to-5 policy cannot schedule any breakfast or
  dinner (s07 worlds widen it).
- No capture of the silent persona exists; the nudge-timer scenario (6 item 8) must be synthetic. follow_up is not
  wired in the bench ("no follow-up timer is wired here"), so a timer event can only test what the loop does when
  triggered, not the timer itself.
- Grader gap (smoke test): a yes recorded on a window-search id at the right instant (central-time A, slot 158)
  grades as a match; the harness's yes-guard would refuse it. Decide whether that is a V rule.
- OpenAI and Gemini keys (OPENAI_API_KEY, GEMINI_API_KEY in var/.env). Unverified: whether gemini-4-argon honours
  thinkingLevel through generateContent; whether gpt-6-astra rejects or ignores temperature (we never send it).
  Gemini's price doubles on 2026-12-01; the table carries both dated entries.
- Multi-turn drift (6 item 13, S15) is built: s15-eight-turn-drift.
- Design corrections still not written into the design (sections 4, 7, 8): temperature cannot be pinned; "seed" is a
  repetition index; A needs `firstStep` for two-step classes; V3's window bound contradicts decision 1 for a party's own
  time (now applied to proposals only); the 92-file vendoring; nightly-snapshot calendars.

## Next action

Bob's call on the matrix: seeds per model (10 proposed), the budget cap (about $500 proposed), which Opus and Haiku ids
(the price table has claude-haiku-5-5, claude-opus-5 and claude-opus-5-5; no claude-haiku-5), and s13's expectation.
Then the keys, one live scenario per new adapter to verify gpt-6-astra and gemini-4-argon, and the matrix, cheapest model
first. Spend so far: $34.10.

## Next action (phase 2b)

Bob reads the synthetic expectations (README "Synthetic set") and the FOR BOB notes; the graders agent takes the two
grader issues; then the dry run that sizes N over captures plus synthetic.

## Next action (phase 2a)

Bob reads the FOR BOB notes and the 6b list. Then: the synthetic scenarios (silent and S15 first), the keys for the
other two providers, and the dry run that sizes N.

## Next action

Run the nine plan 39 runs with a key and read them against run 3 of
`scheduling-agent-evals.md`. Then phase 2: scenario set, second and third
adapters, the dry run that sizes N.

## Pointers

- Winnie's loop: `~/Projects/personal/winnie/winnie/src/capabilities/email/scheduler-agent/`
- Winnie's eval runner (seed for condition C): `~/Projects/personal/winnie/winnie/tools/evals/scheduling-agent.ts`
- Winnie's harness personas and driver: `~/Projects/personal/winnie/winnie/tools/harness/`
- Expected decisions already settled with Bob: `~/Projects/personal/winnie/design/scheduling-agent.md`, `scheduling-agent-evals.md`
- Target program: https://job-boards.greenhouse.io/anthropic/jobs/5438311008
