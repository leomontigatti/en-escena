import { and, eq, type SQL } from "drizzle-orm";

import { comprobantes } from "@/db/schema";

/**
 * What a comprobante belongs to. A choreography comprobante bills one
 * choreography; a seminar comprobante bills what ONE academy holds in ONE
 * seminar, because a seminar is sold to many academies at once and the
 * obligation unit is the pair.
 *
 * The academy travels on the seminar kind only. The root persists it as a
 * column on both, but a choreography already names one and there is nothing to
 * choose: the writer derives it from the choreography, which is exactly where
 * every pre-existing row's value was backfilled from. A seminar names several,
 * so there it is an input.
 *
 * Every rule that used to read "the same choreography" — annulment, the
 * anti-double-billing derivation, the deletion block — reads "the same anchor".
 */
export type ComprobanteAnchor =
  | { kind: "choreography"; choreographyId: string }
  | { kind: "seminar"; academyId: string; seminarId: string };

/** The shorthand for the kind most of the codebase still names implicitly. */
export function choreographyAnchor(choreographyId: string): ComprobanteAnchor {
  return { kind: "choreography", choreographyId };
}

/** The seminar unit, which is the pair and never the seminar alone. */
export function seminarAnchor(
  seminarId: string,
  academyId: string,
): ComprobanteAnchor {
  return { kind: "seminar", academyId, seminarId };
}

/**
 * The set of comprobantes that share an anchor: the scope `vigente`/`anulada`
 * is derived over, and the scope the billed amounts are subtracted from.
 *
 * A choreography scope does NOT filter by academy: the choreography names one,
 * so the pair would be redundant and a row whose backfilled academy somehow
 * disagreed would silently fall out of its own scope. A seminar scope filters
 * by both because the seminar alone names several.
 */
export function comprobanteAnchorFilter(anchor: ComprobanteAnchor): SQL {
  return anchor.kind === "choreography"
    ? eq(comprobantes.choreographyId, anchor.choreographyId)
    : (and(
        eq(comprobantes.seminarId, anchor.seminarId),
        eq(comprobantes.academyId, anchor.academyId),
      ) as SQL);
}

/**
 * The anchor a persisted row names, read back off the two nullable columns. The
 * CHECK guarantees exactly one is set, so the choreography test is enough to
 * tell them apart and the seminar branch asserts what the database holds.
 */
export function readComprobanteAnchor(row: {
  academyId: string;
  choreographyId: string | null;
  seminarId: string | null;
}): ComprobanteAnchor {
  return row.choreographyId !== null
    ? { kind: "choreography", choreographyId: row.choreographyId }
    : {
        kind: "seminar",
        academyId: row.academyId,
        seminarId: row.seminarId as string,
      };
}

/**
 * The two anchor columns as the insert wants them: the one the anchor names and
 * a null beside it. It exists so that nothing outside this module writes a pair
 * the CHECK would refuse. The academy is not here — it is resolved by the
 * writer, which is the only thing that can reach the choreography.
 */
export function comprobanteAnchorColumns(anchor: ComprobanteAnchor): {
  choreographyId: string | null;
  seminarId: string | null;
} {
  return anchor.kind === "choreography"
    ? { choreographyId: anchor.choreographyId, seminarId: null }
    : { choreographyId: null, seminarId: anchor.seminarId };
}
