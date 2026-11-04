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

/** A retention result in the shape the money writers answer with. */
export function toCobroResult(
  result: RetentionResult,
): { ok: true } | { ok: false; message: string } {
  return result.ok
    ? result
    : { ok: false, message: retentionRefusalMessages[result.reason] };
}
