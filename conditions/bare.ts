/**
 * CONDITION A0, THE BARE MODEL (docs/study-design.md sections 4 and 10; called A until 2026-11-06, when A became the
 * raw-tools condition in conditions/raw.ts; run it with --condition=A0): no loop, no tools, no guards. One prompt holds
 * the loop's own rules (prompt.ts WHAT_I_AM and AGENT_RULES), the state as the vendored renderer prints it, and the
 * facts the tools would have returned, precomputed by the vendored tool layer itself (runTool over the same world, so
 * the text and the slot ids are exactly the tools'): read_link for each party with a link, and check_calendar over the
 * plan's window. The model answers with one action in the loop's JSON shape; it is recorded, never executed.
 *
 * The only wording that differs from the loop's prompt is the framing the condition needs: the facts are introduced as
 * already gathered, the tool list is introduced as the actions to choose one from, and "nothing runs after it".
 *
 * NO READ TOOLS IN A'S ACTION LIST (phase 2b smoke test: in three runs A spent its one action on a read, which nothing
 * could answer). A has no tools; the thread is in the state and the calendar check and link read are in its facts, so
 * read_thread, check_calendar and read_link are taken out of the ACTIONS and the prompt says they cannot be re-run. The
 * facts A receives are unchanged. AGENT_RULES are the loop's own and still mention the read tools by name; the note
 * says those lookups are the FACTS.
 */
import { startContext } from '../harness/src/capabilities/email/scheduler-agent/loop.js';
import { AGENT_RULES, TOOL_GUIDE, parseDecision, unreadableWhy } from '../harness/src/capabilities/email/scheduler-agent/prompt.js';
import { renderPlanState, type PlanState } from '../harness/src/capabilities/email/scheduler-agent/state.js';
import { runTool, type Decision, type RunContext, type ToolDeps } from '../harness/src/capabilities/email/scheduler-agent/tools.js';
import { WHAT_I_AM } from '../harness/src/capabilities/email/negotiation-voice.js';
import type { ModelFn } from '../models/types.js';
import type { EventWorld, OfferedTime, Scenario } from '../scenarios/load.js';
import { localDateTime } from '../harness/src/shared/time.js';
import { BENCH_SYSTEM, eventWorld, planState, recordingDeps, recordingModel, snapshot, type CallRecord, type ConditionResult, type ContextSnapshot, type Would } from './common.js';
import { mergeOffers } from './loop.js';
import { buildWorld, type World } from './world.js';

export interface Fact { tool: string; args: Record<string, unknown>; result: string }

/** The loop's read tools: in A their results are the facts, already in the prompt, so they are not actions. */
export const READ_TOOLS = ['read_thread', 'check_calendar', 'read_link'] as const;
/** TOOL_GUIDE without the read tools' lines (each line starts with its tool's JSON). */
export const A_ACTION_GUIDE = TOOL_GUIDE.split('\n').filter((line) => !READ_TOOLS.some((t) => line.startsWith(`{"tool": "${t}"`))).join('\n');
export const A_NO_READS = 'There are no read tools here: the thread is in the state above, and the calendar check and the link read were run for you and are under FACTS ALREADY GATHERED. They cannot be re-run; where the rules say to check or read, use those facts.';

/** The facts, gathered through runTool so they read exactly as the tools render them; ctx.known holds their ids after. */
export async function gatherFacts(sc: Scenario, state: PlanState, world: World, ctx: RunContext, extra: EventWorld['facts'] = [], base = true): Promise<Fact[]> {
  const shape = sc.plan.askShape as { from?: string; days?: number };
  const window = { from: shape.from ?? sc.now.slice(0, 10), days: shape.days ?? 14 };
  const sink: Would[] = [];
  const deps: ToolDeps = { readThread: async () => [], ...world.lookups, ...recordingDeps(world, sink, () => 0), log: { info: () => {}, warn: () => {} } };
  const decisions: Decision[] = [
    ...(base ? state.parties.filter((p) => p.link).map((p): Decision => ({ thought: '', tool: 'read_link', args: { party: p.address, window } })) : []),
    ...(base ? [{ thought: '', tool: 'check_calendar', args: { window } } as Decision] : []),
    // The event's own extra facts (scenario `facts`): what the loop would look up for this reply, e.g. a named time.
    ...extra.map((f): Decision => ({ thought: '', tool: f.tool, args: f.args })),
  ];
  const facts: Fact[] = [];
  for (const d of decisions) {
    const r = await runTool(d, ctx, deps, world.fmt);
    facts.push({ tool: d.tool, args: d.args, result: r.ok ? r.observation : `REFUSED: ${r.refusal}` });
  }
  return facts;
}

export function barePrompt(state: PlanState, trigger: string, facts: readonly Fact[]): string {
  return [
    WHAT_I_AM,
    '',
    AGENT_RULES,
    '',
    'WHAT JUST HAPPENED (the trigger)',
    trigger,
    '',
    renderPlanState(state),
    '',
    'FACTS ALREADY GATHERED (what the tools returned for this plan, in their own words; the slot ids in them are the ones you may name)',
    ...facts.map((f) => `${f.tool} ${JSON.stringify(f.args)}\n  -> ${f.result}`),
    '',
    'ACTIONS (choose exactly ONE; nothing runs after it, so choose the action that should happen now; answer with JSON only, no prose, no code fence)',
    A_NO_READS,
    A_ACTION_GUIDE,
    '',
    'Answer with exactly: {"thought": "<one or two sentences>", "tool": "<name>", "args": {...}}',
  ].join('\n');
}

/** One earlier event of a multi-event A run, as the transcript shows it: what happened, and the one action answered. */
export interface PriorTurn { ev: EventWorld; facts: Fact[]; raw: string }

/** What is new at an event, in the words the A transcript uses (Bob's zone, like the rendered state). */
export function eventSection(ev: EventWorld, tz: string, facts: readonly Fact[]): string {
  const lines = [`EVENT ${ev.index + 1}, ${localDateTime(ev.now, tz)} (${ev.kind}): ${ev.trigger}`];
  for (const m of ev.added.thread) lines.push(`- New on the thread, ${localDateTime(m.at, tz)}, from ${m.from}: "${m.text.replace(/\s+/g, ' ').trim()}"`);
  for (const b of ev.added.bob) lines.push(`- Bob on Telegram, ${localDateTime(b.at, tz)}: "${b.text}"`);
  if (ev.added.thread.length === 0 && ev.added.bob.length === 0) lines.push('- Nothing new on the thread or from Bob.');
  for (const f of facts) lines.push(`${f.tool} ${JSON.stringify(f.args)}\n  -> ${f.result}`);
  return lines.join('\n');
}

/**
 * THE A TRANSCRIPT FOR EVENT k OF A SEQUENCE: the bare prompt of event 0, rendered ONCE (design section 4: in A the state
 * is rendered once, with the thread so far), then for each later event the answer given and what happened next. Between
 * events the bench assumes Bob approved what her answer carded, as in the B and C carry (scenarios/README.md).
 */
export function bareTranscript(first: string, prior: readonly PriorTurn[], now: { ev: EventWorld; facts: Fact[] }, tz: string): string {
  const parts = [first];
  for (let j = 0; j < prior.length; j += 1) {
    const next = j + 1 < prior.length ? prior[j + 1]! : now;
    parts.push('', `YOUR ANSWER TO EVENT ${prior[j]!.ev.index + 1}: ${prior[j]!.raw.trim()}`, '(Bob approved whatever that answer put behind a card.)', '', eventSection(next.ev, tz, next.facts));
  }
  parts.push('', 'Choose exactly ONE action for the latest event, from the ACTIONS above; nothing runs after it.', 'Answer with exactly: {"thought": "<one or two sentences>", "tool": "<name>", "args": {...}}');
  return parts.join('\n');
}

/** State an A sequence keeps between events: the event-0 prompt, the turns so far, and every slot fact the prompt has shown. */
export interface BareSequenceState { first: string; prior: PriorTurn[]; known: ContextSnapshot['known'] }

export async function runBareCondition(sc: Scenario, evIn: number | EventWorld, modelFn: ModelFn, model: string, opts: { minted?: readonly OfferedTime[]; seq?: BareSequenceState } = {}): Promise<ConditionResult & { seq?: BareSequenceState }> {
  const ev = eventWorld(sc, evIn);
  const world = buildWorld(sc, { now: ev.now, offers: mergeOffers(opts.minted ?? [], ev.offered), ...(ev.amendments ? { amendments: ev.amendments } : {}) });
  const calls: CallRecord[] = [];
  try {
    const state = planState(sc, ev);
    // As runSchedulerAgent builds it (loop.ts): the world's now marks a preloaded offer already past, and the trigger rides on the context.
    const ctx = startContext(state, world.now, ev.trigger);
    if (ev.closed) ctx.closed = ev.closed;
    // Every slot an earlier event's facts showed is still on the record (same ids, world seeded with them), and nameable.
    for (const k of opts.seq?.known ?? []) if (!ctx.known.has(k.id)) ctx.known.set(k.id, { ...k });
    const facts = await gatherFacts(sc, state, world, ctx, ev.facts, !opts.seq);
    const prompt = opts.seq ? bareTranscript(opts.seq.first, opts.seq.prior, { ev, facts }, sc.tz) : barePrompt(state, ev.trigger, facts);
    const ask = recordingModel(modelFn, model, BENCH_SYSTEM, calls);
    let raw = '';
    const nextSeq = (r: string): BareSequenceState => ({ first: opts.seq?.first ?? prompt, prior: [...(opts.seq?.prior ?? []), { ev, facts, raw: r }], known: [...ctx.known.values()].map((x) => ({ ...x })) });
    try { raw = await ask(prompt, `adherence:${sc.id}:A0:${ev.index + 1}`); } catch (e) {
      return { condition: 'A0', calls, steps: [], actions: [], outcome: 'error', would: [], cap: 1, facts, minted: world.minted(), error: String(e), seq: nextSeq('') };
    }
    const decision = parseDecision(raw);
    const why = decision ? undefined : unreadableWhy(raw);
    return {
      condition: 'A0', calls, cap: 1, facts, would: [], minted: world.minted(), seq: nextSeq(raw),
      steps: [{ n: 1, raw, parsed: decision, ...(why ? { unreadable: why } : {}), result: decision ? '(condition A: recorded, not executed)' : 'unreadable answer', refused: false }],
      actions: decision ? [{ step: 1, decision, context: snapshot(ctx), refused: false, shadowed: [] }] : [],
      outcome: decision ? 'single-action' : 'unreadable',
    };
  } finally {
    world.close();
  }
}
