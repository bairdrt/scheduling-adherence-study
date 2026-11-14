/**
 * CONDITIONS B AND C: the vendored loop (harness/.../scheduler-agent/loop.ts runSchedulerAgent) over the frozen world,
 * modelled on Winnie's eval runner. The read tools answer truthfully from the fixture; every outward tool only records.
 *
 *   C, the full harness: the guards refuse, as in production.
 *   B, guards shadowed: deps.shadow is set, so every guard refusal in the tool layer is computed, logged on the step it
 *      belongs to, and NOT enforced (tools.ts BENCH edits; the list of sites is in harness/VENDORED.md).
 *
 * Step cap six (MAX_STEPS) in both, as the design's table says. The loop's own stop note (stuck, capped) goes through
 * tellBob, so it is recorded as a would-be tell_bob from the harness, on the step of the last action before the stop.
 */
import { MAX_STEPS, runSchedulerAgent, type LoopDeps } from '../harness/src/capabilities/email/scheduler-agent/loop.js';
import { unreadableWhy } from '../harness/src/capabilities/email/scheduler-agent/prompt.js';
import type { ModelFn } from '../models/types.js';
import type { EventWorld, OfferedTime, Scenario } from '../scenarios/load.js';
import { BENCH_SYSTEM, eventWorld, planState, recordingDeps, recordingModel, snapshot, type ActionRecord, type CallRecord, type ConditionResult, type Would } from './common.js';
import { buildWorld } from './world.js';

/**
 * One event through the loop. `evIn` is an event index (the world resolved standalone from the scenario's record) or a
 * resolved EventWorld (conditions/sequence.ts, carrying what the model did at earlier events). `minted`: every offer id
 * earlier events of this sequence put on the record, so ids keep counting up as in Winnie's store.
 */
export async function runLoopCondition(condition: 'B' | 'C', sc: Scenario, evIn: number | EventWorld, modelFn: ModelFn, model: string, opts: { minted?: readonly OfferedTime[] } = {}): Promise<ConditionResult> {
  const ev = eventWorld(sc, evIn);
  const world = buildWorld(sc, { now: ev.now, offers: mergeOffers(opts.minted ?? [], ev.offered), ...(ev.amendments ? { amendments: ev.amendments } : {}) });
  const calls: CallRecord[] = [];
  const would: Would[] = [];
  const actions: ActionRecord[] = [];
  let current: ActionRecord | null = null;
  const state = planState(sc, ev);
  const deps: LoopDeps = {
    model: recordingModel(modelFn, model, BENCH_SYSTEM, calls),
    fmt: world.fmt, now: () => world.now,
    readThread: async () => ev.thread,
    ...world.lookups,
    ...recordingDeps(world, would, () => current?.step ?? 0, ev),
    log: { info: () => {}, warn: () => {} },
    maxSteps: MAX_STEPS,
    beforeTool: (decision, ctx) => {
      current = { step: calls.length, decision, context: snapshot(ctx), refused: false, shadowed: [] };
      actions.push(current);
    },
    ...(condition === 'B' ? { shadow: (e) => { current?.shadowed.push(e); } } : {}),
    ...(ev.closed ? { closedAtStart: ev.closed } : {}),
  };
  try {
    const run = await runSchedulerAgent(deps, state, ev.trigger);
    // Steps and actions line up by order: a step with a decision is the action recorded just before its tool ran.
    let k = 0;
    const steps = run.steps.map((s, i) => {
      const n = i + 1;
      if (s.decision) { const a = actions[k++]; if (a) { a.result = s.result; a.refused = s.refused; } }
      const why = s.decision ? undefined : unreadableWhy(s.raw);
      return { n, raw: s.raw, parsed: s.decision, ...(why ? { unreadable: why } : {}), result: s.result, refused: s.refused };
    });
    return { condition, calls, steps, actions, outcome: run.outcome, would, cap: MAX_STEPS, minted: world.minted() };
  } catch (e) {
    return { condition, calls, steps: [], actions, outcome: 'error', would, cap: MAX_STEPS, minted: world.minted(), error: String(e) };
  } finally {
    world.close();
  }
}

/** Offer rows by id, the later list winning (the same id always carries the same time; this only de-duplicates). */
export function mergeOffers(a: readonly OfferedTime[], b: readonly OfferedTime[]): OfferedTime[] {
  const m = new Map<number, OfferedTime>();
  for (const o of [...a, ...b]) m.set(o.id, o);
  return [...m.values()].sort((x, y) => x.id - y.id);
}
