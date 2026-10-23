import type {
  RetentionRefusal,
  RetentionResult,
} from "./withdrawal-retention.server";

/**
 * What the two writers of a withdrawn row's money say when they refuse, worded
 * once so the choreography and the seminar side cannot drift.
 */
const retentionRefusalMessages: Record<RetentionRefusal, string> = {
  "nothing-retained": "Esta inscripción no retiene dinero.",
};

/**
 * `Quitar dinero` with an amount, or `Liberar` just the excess, on a withdrawn
 * row: an amount in between the two outcomes is what the clause forbids, so the
 * writers refuse it by name.
 */
export const partialRetainedReleaseMessage =
  "De una inscripción retirada se libera toda la seña retenida o nada.";

/** A retention result in the shape the money writers answer with. */
export function toCobroResult(
  result: RetentionResult,
): { ok: true } | { ok: false; message: string } {
  return result.ok
    ? result
    : { ok: false, message: retentionRefusalMessages[result.reason] };
}
