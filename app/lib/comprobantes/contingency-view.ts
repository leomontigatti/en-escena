import type { ArcaEmissionFailureReason } from "./arca/emission.server";
import { formatArcaMessage, type ArcaMessage } from "./arca/responses";
import type { ComprobanteContingency } from "./contingency-alert";

// The minimal shape of an emission or annulment failure. Both routes produce it
// identically, so the mapping to the UI surface is written once. The `reason`
// admits any string because each route adds its own — `not-found`,
// `nothing-to-bill`, `already-annulled` — but the three that do map are compared
// against `ArcaEmissionFailureReason`: renaming one over there breaks here
// instead of silently degrading to a generic error.
export type ContingencyFailure = {
  reason: string;
  message: string;
  arca?: {
    resultado: string | null;
    errors: ArcaMessage[];
    observaciones: ArcaMessage[];
  };
  attempt?: { ptoVta: number; cbteTipo: number; cbteNro: number };
};

/**
 * Translates a failure from the server into what the operator sees (ADR-0012
 * decision 6). It returns `null` for failures that are not ARCA contingencies —
 * a non-existent choreography, nothing to bill, an already annulled comprobante:
 * those are generic errors and neither enable nor block any retry.
 *
 * The `message` travels exactly as the server wrote it: it is aware of the
 * subject ("el comprobante" vs. "la nota de crédito") and of the reason (whether
 * ARCA may still be authorizing), and rewriting it here would lose both
 * distinctions.
 */
const REJECTED: ArcaEmissionFailureReason = "rejected";
const NOT_EMITTED: ArcaEmissionFailureReason = "not-emitted";
const UNVERIFIED: ArcaEmissionFailureReason = "unverified";

export function toComprobanteContingency(
  failure: ContingencyFailure,
): ComprobanteContingency | null {
  if (failure.reason === REJECTED) {
    return {
      status: "rejected",
      message: failure.message,
      resultado: failure.arca?.resultado ?? null,
      errors: (failure.arca?.errors ?? []).map(formatArcaMessage),
      observaciones: (failure.arca?.observaciones ?? []).map(formatArcaMessage),
    };
  }

  if (failure.reason === NOT_EMITTED) {
    return { status: "not-emitted", message: failure.message };
  }

  if (failure.reason === UNVERIFIED && failure.attempt) {
    return {
      status: "unverified",
      message: failure.message,
      ...failure.attempt,
    };
  }

  return null;
}

// What an action returns on a failure: the contingency if ARCA produced one, and
// otherwise a generic error. Both features produce it identically.
export type ContingencyActionData =
  | { status: "error"; message: string }
  | { status: "contingency"; contingency: ComprobanteContingency };

/**
 * Wraps `toComprobanteContingency` in the `actionData` the two dialogs consume.
 * It lives here rather than in each feature so the failure → UI state
 * translation cannot diverge between emission and annulment: the `unverified`
 * state blocks a destructive submit, and the consequence of that drift is a
 * second fiscal comprobante.
 */
export function toContingencyActionData(
  failure: ContingencyFailure,
): ContingencyActionData {
  const contingency = toComprobanteContingency(failure);

  return contingency
    ? { status: "contingency", contingency }
    : { status: "error", message: failure.message };
}
