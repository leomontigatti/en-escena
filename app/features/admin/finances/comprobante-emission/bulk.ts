import type { KnownComprobanteKind } from "@/lib/comprobantes/kind";

import type { ComprobanteEmissionActionData } from "./shared";

/*
 * Bulk emission (#617, #1712): N single emissions the browser drives one after
 * the other from the academy's finance list, each the `emit-comprobante`
 * intent a financial detail posts. There is no batch on the server and nothing
 * persisted about the run: a choreography already documented owes nothing, so
 * selecting again is how a stopped run resumes.
 */

/** What one choreography of the selection would emit, or why it would not. */
export type BulkEmissionPlan =
  | { status: "ready"; kind: KnownComprobanteKind; amount: number }
  | { status: "skipped"; reasons: string[] };

export type BulkEmission = {
  // Every choreography of the list, keyed by id: the selection picks from it.
  plans: Record<string, BulkEmissionPlan>;
  // The run's one date: today by default, never after it, and never before
  // the floor of any series the run emits in (ADR-0014 §5).
  cbteFch: {
    today: string;
    floors: Partial<
      Record<KnownComprobanteKind, { floor: string; description: string }>
    >;
  };
  // A live reservation blocks its series, so the action says so before the
  // run rather than halting on it (#617 §7).
  blocked: { reason: string } | null;
};

// The field naming the choreography each request of the run emits for.
export const bulkChoreographyIdField = "choreographyId";

// What one request of the run answers: the number it emitted, or what the
// detail's dialog would have shown.
export type BulkEmissionActionData =
  | ComprobanteEmissionActionData
  | { status: "success"; number: string; recovered: boolean };

/**
 * The run's date bounds over the kinds it emits: the latest floor among their
 * series, with what sets it. `null` floor when it emits nothing.
 */
export function resolveBulkCbteFchBounds(
  cbteFch: BulkEmission["cbteFch"],
  kinds: Iterable<KnownComprobanteKind>,
): { floor: string; description: string; max: string } | null {
  let strictest: { floor: string; description: string } | null = null;

  for (const kind of new Set(kinds)) {
    const bound = cbteFch.floors[kind];

    if (bound && (strictest === null || bound.floor > strictest.floor)) {
      strictest = bound;
    }
  }

  return strictest && { ...strictest, max: cbteFch.today };
}

// One emission takes 10 to 20 seconds as a rule and up to a minute when ARCA
// is slow (#617 §5): the lookup, the authorization and the consult, each
// bounded by its timeout.
const TYPICAL_SECONDS = { low: 10, high: 20 };
const WORST_SECONDS = 60;

/**
 * How long a run of `count` emissions may take, stated before it starts: the
 * cost of a large selection is time, and it is told rather than capped.
 */
export function describeBulkDuration(count: number): string {
  const typical = `entre ${formatDuration(count * TYPICAL_SECONDS.low)} y ${formatDuration(count * TYPICAL_SECONDS.high)}`;

  return `Suele tardar ${typical}, y hasta ${formatDuration(count * WORST_SECONDS)} si ARCA demora.`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds} segundos`;
  }

  const minutes = Math.ceil(seconds / 60);

  return minutes === 1 ? "1 minuto" : `${minutes} minutos`;
}
