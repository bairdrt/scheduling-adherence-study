# Scheduling adherence study

How often do language models act outside their stated rules on multi-turn
scheduling tasks, and how much of that does a harness prevent? A
pre-registered ablation of Winnie's scheduling harness across models.

**Why.** Winnie is Bob Baird's executive-assistant agent: it reads his mail, holds his calendar and schedules
meetings with other people under rules he has stated. Its scheduling harness exists because models did not reliably
stay inside those rules once a thread ran to several turns. This study asks whether the harness still earns its keep
against current models, which of its parts does the work, and what the harness itself gets wrong.

**Start here.**
- The page: <https://bairdrt.github.io/scheduling-adherence-study/>. An overview and the findings, then each finding
  taken apart, then a browser over every one of the 5,040 runs.
- The write-up: `docs/write-up.md` (2026-11-14). Section 0 is the motivation, section 11 the limitations.
- The pre-registration: `docs/study-design.md`, sections 1 to 12 written before the first run; section 13 and 14 the
  dated record of every change and ruling after it. `docs/lab-notebook.md` is the day-by-day account.
- Current state: `docs/project-state.md`.

**How it was built.** Bob wrote the research questions and the four hypotheses before the first run, ruled on every
expectation as a dated, numbered ruling, hand-labelled the 30 texts that calibrate the prose judge, and read the runs.
Claude sessions under his direction built the bench, the graders and the scenarios, ran the matrix and drafted the
page and the write-up. Every commit carries both names.

**In short.** On the 32 scenarios the harness was built against, it lifts outcome match by 20 to 25 points on every
model tested (Haiku 5.5, Sonnet 5, Sonnet 5.5; 480 event-runs a cell), nearly all of it from structured state and
deterministic tools, 2 to 6 points from the guards. On six scenarios written after the harness's last change, in shapes
no build request named, the edge is +4, +3 and -7 of 80, and the one repeated failure is the harness's own: a yes
recorded on an offer Bob had withdrawn. The bare model's violations are decisions that were Bob's and bookings without
a yes; the harness removes both. On prose, the bare model reports a held mail as sent in 10 to 14% of runs and the
harness takes that to 0 to 3% (judge agreement with Bob 29 of 30). Opus did not run (the API refused the step format);
GPT and Gemini were not run.

| seen set, outcome match of 480 | A bare | B shadowed | C full harness |
|---|---|---|---|
| Haiku 5.5 | 331 (69%) | 418 (87%) | 429 (89%) |
| Sonnet 5 | 319 (66%) | 421 (88%) | 438 (91%) |
| Sonnet 5.5 | 349 (73%) | 430 (90%) | 457 (95%) |

| held-out set, of 80 | A bare | B shadowed | C full harness |
|---|---|---|---|
| Haiku 5.5 | 71 (89%) | 76 (95%) | 75 (94%) |
| Sonnet 5 | 67 (84%) | 67 (84%) | 70 (88%) |
| Sonnet 5.5 | 77 (96%) | 70 (88%) | 70 (88%) |

```
npm install
npx vitest run                                   # graders, conditions, loader; no API calls
npx tsx bench/run.ts --scenario=plan-39 --condition=all --model=claude-sonnet-5 --seeds=3
npx tsx bench/summarize.ts --by=condition runs/2026-11-09/[!h]*-claude-sonnet-5-5-*.judged.jsonl   # one model, seen set; see docs/write-up.md section 12
```

`--condition=A|A0|B|C|all` picks what stands between the model and the world (design sections 4 and 13). **A** is the
model with raw tools and no prepared state: a plain-language brief, the thread, and generic calendar, mail and link
tools shaped like an MCP tool list, run to completion in up to ten steps (`conditions/raw.ts`); its raw calls are
mapped onto Winnie's decision classes so the same graders read it (`conditions/raw-map.ts`). **A0** is the earlier
one-action bare prompt handed the facts the harness gathers (`conditions/bare.ts`), kept for the record and the dry-run
comparison, and not in the matrix; run lines stored before 2026-11-06 as `A` with a step cap of 1 are read as A0.
**B** is Winnie's loop with its guards computed and not enforced, **C** the full harness. `all` runs A, B and C. In
every condition nothing is sent, booked or told to Bob: each write is recorded only.

**The harness under test is not in this repository.** `harness/` is Winnie's scheduler agent, vendored at a pinned
commit (the dates and commits are in the write-up and the design). It is Bob's production code and it carries his
contacts' names and addresses, so it is held privately and given to reviewers on request: clone it into `harness/`
and everything below runs. Without it the bench, the graders and the tests do not run, and the run files, the
scenarios, the graders' source and the page are what can be read here.

Layout: `harness/` (Winnie's scheduler-agent, vendored at a pinned commit, private; see above), `conditions/`,
`models/`, `graders/`, `scenarios/` (`scenarios/README.md`), `bench/`, `runs/`, `tools/capture-calendar.ts`,
`docs/site/` (the page; `npx tsx tools/site/build.mts` rebuilds its data files from the run files).

The run files are most of the repository (about 900MB; the final matrix's judged files are `runs/2026-11-09/`).
`git clone --filter=blob:none` fetches the history without them until a checkout needs one.

License: MIT (`LICENSE`). The anonymization and redaction maps behind the scenarios are not in the repository and
never will be; the scenarios carry example-domain names only. This public tree is exported from a private working
repository by `tools/publish-public.sh` as one commit per publish; the day-by-day record is `docs/lab-notebook.md`.
