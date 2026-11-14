import { expect } from 'vitest';
import { runScenario } from '../bench/run.js';
import { V_KEYS } from '../graders/index.js';
import type { Scenario } from '../scenarios/load.js';
import type { ModelFn } from '../models/types.js';

/** A model that answers with the given texts in order (the last repeats), at zero cost. No API call. */
export function scripted(texts: readonly string[]): ModelFn & { prompts: string[] } {
  const prompts: string[] = [];
  const fn = (async (prompt: string): Promise<Awaited<ReturnType<ModelFn>>> => {
    prompts.push(prompt);
    const text = texts[Math.min(prompts.length - 1, texts.length - 1)] ?? '';
    return { text, inputTokens: 100, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0, model: 'scripted', latencyMs: 0, stopReason: 'end_turn', costUsd: 0 };
  }) as unknown as ModelFn & { prompts: string[] };
  fn.prompts = prompts;
  return fn;
}

export const act = (tool: string, args: Record<string, unknown>, thought = 'scripted'): string => JSON.stringify({ thought, tool, args });

export const FINLEY = 'finley.bramley@example.net';
export const EMERY = 'emery.ashby@example.org';
/** Mon Oct 19 11:30 in Bob's zone (EDT), the single overlap of plan 39. */
export const MON_1130 = '2026-10-19T15:30:00.000Z';

/* ------------------------------------------------------------ the scripted expected path (synthetic and held-out sets) */

type Arg = unknown;
export interface Step { tool: string; args: Record<string, Arg> }
export const s = (tool: string, args: Record<string, Arg> = {}): Step => ({ tool, args });
export const card = (text: string): Step => s('tell_bob', { text });

/**
 * A model that takes `steps` in order across every call (all events of a sequence), resolving "@<label>" (a slot's
 * start as the tools print it, "Thu, Nov 12, 2:00pm") to the id the prompt shows for it: the last "slot N: <label> to"
 * (a check or link) or "slot N (<label> to" (SENT) in the prompt.
 */
export function pathModel(steps: readonly Step[]): ModelFn & { prompts: string[] } {
  const prompts: string[] = [];
  const resolve = (v: Arg, prompt: string): Arg => {
    if (Array.isArray(v)) return v.map((x) => resolve(x, prompt));
    if (typeof v !== 'string' || !v.startsWith('@')) return v;
    const label = v.slice(1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const hits = [...prompt.matchAll(new RegExp(`slot (\\d+)(?::| \\() ?${label} to`, 'g'))];
    if (!hits.length) throw new Error(`the prompt shows no slot at ${v}`);
    return Number(hits[hits.length - 1]![1]);
  };
  const fn = (async (prompt: string) => {
    prompts.push(prompt);
    const st = steps[prompts.length - 1];
    if (!st) throw new Error(`the path ran out at call ${prompts.length}`);
    const args = Object.fromEntries(Object.entries(st.args).map(([k, v]) => [k, resolve(v, prompt)]));
    return { text: JSON.stringify({ thought: 'expected path', tool: st.tool, args }), inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, model: 'scripted', latencyMs: 0, stopReason: 'end_turn', costUsd: 0 };
  }) as unknown as ModelFn & { prompts: string[] };
  fn.prompts = prompts;
  return fn;
}

/**
 * The expected path meets its own expectation: the scripted model takes the loop's path (B, C) or A0's one action per
 * event, every event matches its expectation, no model V grader fires, nothing is refused or shadowed, and the loop is
 * neither capped nor stuck; the path is used up exactly.
 */
export async function meetsItsExpectation(sc: Scenario, cond: 'A0' | 'B' | 'C', path: { loop: readonly Step[]; a: readonly Step[] }): Promise<void> {
  const steps = cond === 'A0' ? path.a : path.loop;
  const model = pathModel(steps);
  const lines = await runScenario(sc, cond, model, 'scripted', 1);
  expect(lines).toHaveLength(sc.events.length);
  for (const l of lines) {
    const why = `${sc.id} ${cond} event ${l.eventIndex}: ${JSON.stringify({ outcome: l.graders.outcome, actions: l.actions.map((a) => [a.tool, a.refused, a.result?.slice(0, 160)]), err: l.error })}`;
    expect(l.error, why).toBeUndefined();
    expect(l.graders.outcome.match, why).toBe(true);
    for (const k of V_KEYS) expect((l.graders as unknown as Record<string, { fired: boolean; detail: string[] }>)[k]?.fired, `${why} ${k}: ${(l.graders as unknown as Record<string, { detail: string[] }>)[k]?.detail.join('; ')}`).toBe(false);
    expect(l.actions.filter((a) => a.refused).map((a) => a.result), why).toEqual([]);
    expect(l.shadowedRefusals, why).toEqual([]);
    if (cond !== 'A0') expect(l.outcome, why).not.toMatch(/capped|stuck/);
  }
  expect(model.prompts.length).toBe(steps.length);
}
