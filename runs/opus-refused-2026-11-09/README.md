# The Opus cells of the matrix (2026-11-09, night): refused by the API, not a column

228 run files, claude-opus-5 and claude-opus-5-5 on A, B and C, 5 seeds, every seen
and held-out scenario. They were written by bench/run.ts into runs/2026-11-09 and
moved here so that no table over that folder counts them (design section 14,
ruling 32).

Every Opus 5.5 step (1,680 of 1,680) and most Opus 5 steps (1,093 of 1,769) came
back with stop_reason `refusal`, zero output tokens, and `stop_details.category`
`reasoning_extraction`: the API's terms-of-service classifier against duplicating
model outputs, which the step prompt's answer format trips (`{"thought": ...,
"tool": ..., "args": ...}`; lab notebook 2026-11-10). The loop reads each as an
unreadable answer, so the Opus 5.5 lines are all `stuck` and the Opus 5 B and C
lines that `ended` (144 and 147 of 280) are the ones the classifier let through:
a biased subsample. Not reported anywhere as a result. Cost $109.16.
