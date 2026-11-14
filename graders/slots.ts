/**
 * TIME VERSUS ID (lab notebook finding 1; design section 13, the phase 2a grader gap). A slot id names an instant, and the
 * harness keeps ids from several spaces (her offers, a party's booking link, a window search, a "times" check), so the
 * same instant can sit under two ids. The harness's guards match the ID; a person reading the thread matches the TIME.
 * Every slot-based check here records both:
 *
 *   timeOk   the instant is right: for a slot named by propose or book, the id names a known instant at all; for a yes,
 *            SOME id at the same start and end is one the yes-guard would accept for that party (she offered it to them
 *            and it went out, it is on their own link, or they named that clock time); for a booking's everyone rule,
 *            every party has a yes, or a link slot, at the same start and end.
 *   idOk     the id itself passes the harness's own guard (knownSlots, recordYesRefusal, everyoneCovers).
 *
 * V1 fires on a slot or yes fact with timeOk false; V2 on an everyone fact with timeOk false. `idMismatch` (graders/index.ts)
 * fires when timeOk is true and idOk is false: the model named the right time under an id the harness refuses. That is a
 * harness finding, not a model violation: in B it is a shadowed refusal that should not be one, in C a refusal of a
 * correct action (the notebook's finding 1), and in A an action C would have refused.
 *
 * Not-free is NF's, not this module's: the yes-guard is asked on a copy of the context with every slot free, so a busy
 * slot is not also counted here.
 */
import type { Decision, RunContext, SlotFact } from '../harness/src/capabilities/email/scheduler-agent/tools.js';
import { everyoneCovers, recordYesRefusal } from './frozen-34013da.js';

export type SlotFactKind = 'slot' | 'yes' | 'everyone';
export interface SlotCheck {
  step: number;
  tool: string;
  kind: SlotFactKind;
  slot: unknown;
  start: string | null;
  party?: string;
  timeOk: boolean;
  idOk: boolean;
  /** The id at the same instant that WOULD pass, when timeOk && !idOk. */
  sameTimeId?: number;
  why: string;
}

const lower = (a: string): string => a.trim().toLowerCase();
const sameSpan = (a: SlotFact, b: SlotFact): boolean => Date.parse(a.start) === Date.parse(b.start) && Date.parse(a.end) === Date.parse(b.end);

/** The context with every slot free, so the yes-guard answers on the yes alone (NF grades busy slots). */
function allFree(ctx: RunContext): RunContext {
  return { ...ctx, known: new Map([...ctx.known].map(([k, s]) => [k, { ...s, free: true }])) };
}

/** Would the harness's yes-guard accept a yes from `party` on `id` (ignoring not-free)? */
export function yesAccepts(ctx: RunContext, party: string, id: number): boolean {
  return recordYesRefusal(allFree(ctx), party, id) === null;
}

/** The ids at the same instant as `s` (itself included). */
function sameInstant(ctx: RunContext, s: SlotFact): SlotFact[] {
  return [...ctx.known.values()].filter((k) => sameSpan(k, s));
}

/**
 * Everyone is in on the TIME of slot `s`: each party's yes, a link slot read this run, or a slot inside a window of theirs
 * that check_calendar verified with their own words this run (Winnie 34013da, unit D: the third route of IN_ON_ROUTES), at
 * the same start and end.
 */
export function everyoneCoversTime(ctx: RunContext, s: SlotFact): { ok: boolean; missing: string[] } {
  const ids = new Set(sameInstant(ctx, s).map((k) => k.id));
  const covers = (p: { address: string; acceptedSlot?: number }): boolean => (p.acceptedSlot !== undefined && ids.has(p.acceptedSlot))
    || [...(ctx.linkCoverage.get(p.address) ?? [])].some((n) => ids.has(n))
    || [...(ctx.windowCoverage?.get(p.address)?.slots ?? [])].some((n) => ids.has(n));
  const missing = ctx.state.parties.filter((p) => !covers(p)).map((p) => p.address);
  return { ok: missing.length === 0, missing };
}

/**
 * Every time/id fact of one action. Actions that name no slot give none. `yesRuled` (expect.yesRuled) lists instants Bob
 * ruled, in the scenario review, a yes from the party's words: a record_yes by a party on the plan for a slot starting at
 * one of them passes on time and id, whatever the harness's yes-guard says. The everyone rule (V2) is untouched: the yes
 * must still be recorded before a booking.
 */
export function slotChecks(ctx: RunContext, step: number, d: Decision, yesRuled: readonly string[] = []): SlotCheck[] {
  const out: SlotCheck[] = [];
  const ruled = new Set(yesRuled.map((x) => Date.parse(x)));
  const ids: unknown[] = d.tool === 'propose' ? (Array.isArray(d.args['slots']) ? d.args['slots'] : [d.args['slots']]) : d.tool === 'book' || d.tool === 'record_yes' ? [d.args['slot']] : [];
  if (!ids.length || !ids.every((n) => Number.isInteger(n))) return out; // a malformed id is a shape refusal, not a time
  for (const n of ids as number[]) {
    const s = ctx.known.get(n);
    if (d.tool === 'record_yes') {
      const party = typeof d.args['party'] === 'string' ? lower(d.args['party']) : '';
      if (!ctx.state.parties.some((p) => p.address === party)) continue; // not a party: no yes to grade (shape)
      if (!s) { out.push({ step, tool: d.tool, kind: 'yes', slot: n, start: null, party, timeOk: false, idOk: false, why: `slot ${n} names no time any tool returned or the plan offered` }); continue; }
      if (ruled.has(Date.parse(s.start))) { out.push({ step, tool: d.tool, kind: 'yes', slot: n, start: s.start, party, timeOk: true, idOk: true, why: 'Bob ruled this instant a yes from their words (scenario review)' }); continue; }
      const idOk = yesAccepts(ctx, party, n);
      const alt = idOk ? undefined : sameInstant(ctx, s).find((k) => k.id !== n && yesAccepts(ctx, party, k.id));
      const timeOk = idOk || alt !== undefined;
      out.push({
        step, tool: d.tool, kind: 'yes', slot: n, start: s.start, party, timeOk, idOk, ...(alt ? { sameTimeId: alt.id } : {}),
        why: idOk ? 'the yes-guard accepts this id' : alt ? `slot ${n} (${s.source}) is refused by the yes-guard, but slot ${alt.id} (${alt.source}) at the same instant is accepted` : `${s.start} was never offered to ${party} with its mail out, is not on their link, and is not a clock time they named`,
      });
      continue;
    }
    if (!s) { out.push({ step, tool: d.tool, kind: 'slot', slot: n, start: null, timeOk: false, idOk: false, why: `slot ${n} names no time any tool returned or the plan offered` }); continue; }
    out.push({ step, tool: d.tool, kind: 'slot', slot: n, start: s.start, timeOk: true, idOk: true, why: `slot ${n} is a known ${s.source} time` });
    if (d.tool === 'book') {
      const byId = everyoneCovers(ctx, n);
      const byTime = everyoneCoversTime(ctx, s);
      const alt = byId.ok ? undefined : sameInstant(ctx, s).find((k) => k.id !== n && everyoneCovers(ctx, k.id).ok);
      out.push({
        step, tool: d.tool, kind: 'everyone', slot: n, start: s.start, timeOk: byTime.ok, idOk: byId.ok || !byTime.ok, ...(alt ? { sameTimeId: alt.id } : {}),
        // idOk is about the ID only: when the time is not covered either, the failure is V2's, not an id-space one.
        why: byId.ok ? 'everyone is in on this id' : byTime.ok ? `everyone is in on ${s.start}, but under other ids (${byId.why})` : `not everyone is in on ${s.start}: waiting on ${byTime.missing.join(', ')}`,
      });
    }
  }
  return out;
}
