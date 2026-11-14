/**
 * RE-GRADING A STORED RUN LINE with the current graders (bench/summarize.ts reads every line through here, so a grader
 * added after a run still grades it). Everything a V grader reads is in the line: each action with the context snapshot
 * it was chosen in, refused and shadowed flags, the run's outcome and step count. The plan state is rebuilt from the
 * scenario at the event, standalone (resolveEvent from the scenario's own record of earlier events): for an event that
 * ran on a carry from the model's own earlier run, the parties' words and the colleagues are the same either way (the
 * thread comes from the scenario), and yeses, offers and links come from the snapshot, not the state.
 *
 * The OUTCOME verdict is RE-GRADED too, against the expectation as the scenario holds it now (so an expectation fixed
 * after a run, such as a firstStep added, and a grader fix, such as firstStep applying to every sub-check, both reach the
 * stored runs). One part cannot be rebuilt standalone: a slot the persona chose from the model's OWN earlier proposal
 * (slotFrom "persona" on an event that ran on a carry from the run). There the stored slotMatch is kept and the match
 * recomputed around it. Phase 2b's first summary kept the whole outcome as stored; this replaced that.
 *
 * A LINE'S CONDITION is read through conditionOf (bench/run.ts): a line written before 2026-11-06 with condition 'A' is
 * the one-action bare condition, now A0, and is re-graded as A0 (firstStep applies to it, and not to the raw-tools A).
 */
import { planState, type ActionRecord, type ConditionResult, type ContextSnapshot } from '../conditions/common.js';
import type { Decision } from '../harness/src/capabilities/email/scheduler-agent/tools.js';
import { loadScenario, resolveEvent, type Scenario } from '../scenarios/load.js';
import { conditionOf, type RunLine } from '../bench/run.js';
import { gradeRun, type Grades } from './index.js';

const cache = new Map<string, Scenario>();
function scenario(id: string): Scenario {
  let sc = cache.get(id);
  if (!sc) { sc = loadScenario(id); cache.set(id, sc); }
  return sc;
}

/** The ConditionResult a line was graded from, as far as the graders read it. */
export function resultOf(l: RunLine): ConditionResult {
  return {
    condition: conditionOf(l), calls: [],
    steps: l.steps.map((s) => ({ n: s.n, raw: s.text, parsed: (s.parsed as Decision | null) ?? null, result: s.result, refused: s.refused })),
    actions: l.actions.map((a): ActionRecord => ({
      step: a.step, decision: { thought: a.thought, tool: a.tool as Decision['tool'], args: a.args }, context: a.context as ContextSnapshot,
      ...(a.result !== undefined ? { result: a.result } : {}), refused: a.refused, shadowed: a.shadowed as ActionRecord['shadowed'], ...(a.raw ? { raw: a.raw } : {}),
    })),
    outcome: l.outcome, would: l.would as ConditionResult['would'], cap: l.harness.stepCap,
  };
}

export function regradeLine(l: RunLine): Grades {
  const sc = scenario(l.scenario);
  const ev = resolveEvent(sc, l.eventIndex);
  const g = gradeRun(sc, ev, planState(sc, ev), resultOf(l));
  const fromRun = (l.sequence?.carriedFrom ?? 'capture') !== 'capture';
  const personaSlot = ev.expect.slotFrom === 'persona' || (ev.expect.v4 as { expectedStart?: string } | undefined)?.expectedStart === 'persona';
  if (fromRun && personaSlot && g.outcome.slotMatch !== null) {
    const o = { ...g.outcome, slotMatch: l.graders.outcome.slotMatch };
    o.match = o.classMatch && o.reachesRequired !== false && o.slotMatch !== false && o.tellBobMatch !== false;
    return { ...g, outcome: o };
  }
  return g;
}

/** A line with current grades; on a failure (a scenario since renamed or broken), the stored grades and the reason. */
export function regraded(l: RunLine): { line: RunLine; error?: string } {
  try { return { line: { ...l, graders: regradeLine(l) } }; } catch (e) { return { line: l, error: String(e instanceof Error ? e.message : e) }; }
}
