import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { comprobanteInscriptions, comprobantes } from "@/db/schema";
import type { InscriptionAnomaly } from "@/lib/finances/inscription-financial-status";
import { getBusinessDateOnly } from "@/lib/shared/business-time-zone";

import { comprobanteAnchorFilter, type ComprobanteAnchor } from "./anchor";
import {
  deriveAnchorBilling,
  type AnchorBilling,
  type BilledInscription,
} from "./anchor-billing";
import { deriveOwedAmount, type DocumentedComprobante } from "./emission-plan";

/** An inscription as the finance rollups resolve it, of either kind. */
type ResolvedUnitInscription = {
  allocatedAmount: number;
  depositAmount: number | null;
  id: string;
  totalAmount: number | null;
  withdrawn: boolean;
  withdrawnAt: Date | null;
};

/**
 * The billing reading of every invoiced unit of one academy in one event, keyed
 * by the choreography or by the seminar of the `(seminar, academy)` pair. A
 * unit with no invoice is absent.
 */
export type AcademyAnchorBilling = {
  choreographies: Map<string, AnchorBilling>;
  seminars: Map<string, AnchorBilling>;
};

/**
 * What the academy's documents leave pending, for its finance list and its
 * financial details. The inscriptions are the ones the academy's rollup
 * already resolved, the same figures the emitter bills by; this read adds the
 * academy's comprobantes and their lines (one anchor's, on a detail), two
 * queries whatever the number of units, and hands each unit to
 * `deriveAnchorBilling`.
 *
 * Administration only: the academy is told nothing when its bill moves
 * (ADR-0014 §10).
 */
export async function readAcademyAnchorBilling(input: {
  academyId: string;
  eventId: string;
  // A financial detail reads its own anchor alone; the list reads them all.
  anchor?: ComprobanteAnchor;
  choreographyInscriptions: ReadonlyArray<
    ResolvedUnitInscription & { choreographyId: string }
  >;
  seminarInscriptions: ReadonlyArray<
    ResolvedUnitInscription & { seminarId: string }
  >;
  // The business date, `AAAA-MM-DD`; Córdoba's today when absent.
  today?: string;
}): Promise<AcademyAnchorBilling> {
  // Only what the delta reads: the kind, the total, the star and the lines.
  const rows = await db
    .select({
      associatedComprobanteId: comprobantes.associatedComprobanteId,
      cbteTipo: comprobantes.cbteTipo,
      choreographyId: comprobantes.choreographyId,
      id: comprobantes.id,
      impTotal: comprobantes.impTotal,
      seminarId: comprobantes.seminarId,
    })
    .from(comprobantes)
    .where(
      and(
        eq(comprobantes.academyId, input.academyId),
        eq(comprobantes.eventId, input.eventId),
        input.anchor ? comprobanteAnchorFilter(input.anchor) : undefined,
      ),
    )
    // Emission order, as the emitter reads it: the first invoice is the one
    // the star anchors at.
    .orderBy(asc(comprobantes.createdAt));
  const lineRows =
    rows.length === 0
      ? []
      : await db
          .select({
            amount: comprobanteInscriptions.amount,
            choreographyInscriptionId:
              comprobanteInscriptions.choreographyInscriptionId,
            comprobanteId: comprobanteInscriptions.comprobanteId,
            seminarInscriptionId: comprobanteInscriptions.seminarInscriptionId,
          })
          .from(comprobanteInscriptions)
          .where(
            inArray(
              comprobanteInscriptions.comprobanteId,
              rows.map((row) => row.id),
            ),
          );
  const documentsByUnit = {
    choreographies: new Map<string, DocumentedComprobante[]>(),
    seminars: new Map<string, DocumentedComprobante[]>(),
  };

  for (const row of rows) {
    const [units, unitId] =
      row.choreographyId !== null
        ? [documentsByUnit.choreographies, row.choreographyId]
        : [documentsByUnit.seminars, row.seminarId as string];
    const documents = units.get(unitId) ?? [];

    documents.push({
      id: row.id,
      cbteTipo: row.cbteTipo,
      impTotal: row.impTotal,
      associatedComprobanteId: row.associatedComprobanteId,
      // A line names one inscription of the anchor's own kind, so whichever
      // column is set is the one.
      lines: lineRows
        .filter((line) => line.comprobanteId === row.id)
        .map((line) => ({
          amount: line.amount,
          inscriptionId:
            line.choreographyInscriptionId ?? line.seminarInscriptionId,
        })),
    });
    units.set(unitId, documents);
  }

  const today = input.today ?? getBusinessDateOnly();

  return {
    choreographies: readUnits(
      documentsByUnit.choreographies,
      input.choreographyInscriptions,
      (inscription) => inscription.choreographyId,
      today,
    ),
    seminars: readUnits(
      documentsByUnit.seminars,
      input.seminarInscriptions,
      (inscription) => inscription.seminarId,
      today,
    ),
  };
}

// Each invoiced unit's reading, keyed by the unit; a unit with no invoice reads
// `null` and is left out.
function readUnits<TInscription extends ResolvedUnitInscription>(
  documentsByUnit: ReadonlyMap<string, DocumentedComprobante[]>,
  inscriptions: readonly TInscription[],
  unitOf: (inscription: TInscription) => string,
  today: string,
): Map<string, AnchorBilling> {
  const readings = new Map<string, AnchorBilling>();

  for (const [unitId, documents] of documentsByUnit) {
    const reading = deriveAnchorBilling({
      inscriptions: inscriptions
        .filter((inscription) => unitOf(inscription) === unitId)
        .map(toBilledInscription),
      comprobantes: documents,
      today,
    });

    if (reading) {
      readings.set(unitId, reading);
    }
  }

  return readings;
}

function toBilledInscription(
  inscription: ResolvedUnitInscription,
): BilledInscription {
  return {
    id: inscription.id,
    owed: deriveOwedAmount(inscription),
    withdrawnAt: inscription.withdrawnAt,
  };
}

/**
 * A unit's finance row with its billing anomaly joined to the anomalies it
 * already carries, and the clock beside it. The badge, its filter and the
 * detail's alert all read the array, so the anomaly needs no path of its own.
 */
export function withAnchorBilling<
  TRow extends { anomalies: InscriptionAnomaly[] },
>(
  row: TRow,
  billing: AnchorBilling | undefined,
): TRow & { creditClockDays: number | null } {
  return {
    ...row,
    anomalies: billing?.anomaly
      ? [...row.anomalies, billing.anomaly]
      : row.anomalies,
    creditClockDays: billing?.creditClockDays ?? null,
  };
}
