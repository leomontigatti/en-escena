import { describeCbteFchFloor } from "@/lib/comprobantes/cbte-fch";
import {
  deriveAnchorObligation,
  emissionRefusalLabel,
  planAnchorEmission,
  type DocumentedComprobante,
} from "@/lib/comprobantes/emission-plan";
import { readKindCbteFchBounds } from "@/lib/comprobantes/emit-comprobante.server";
import { readConfiguredPtoVta } from "@/lib/comprobantes/emission-config.server";
import type { KnownComprobanteKind } from "@/lib/comprobantes/kind";
import {
  blockedBy,
  findLiveReservation,
} from "@/lib/comprobantes/reservation.server";
import type { InscriptionFinancialStatus } from "@/lib/finances/inscription-financial-status";
import { getBusinessDateOnly } from "@/lib/shared/business-time-zone";

import type { BulkEmission, BulkEmissionPlan } from "./bulk";

/**
 * The bulk emission's plan for every choreography of an academy's finance
 * list (#617 §3): what each would emit, through the emitter's own
 * `planAnchorEmission` over the rollup the list already read, or why it would
 * not. It is a plan, not a commitment: each emission plans again under its
 * lock and refuses a document that changed since.
 */
export async function readChoreographyBulkEmission(input: {
  rows: ReadonlyArray<{
    id: string;
    financialStatus: InscriptionFinancialStatus;
  }>;
  inscriptions: ReadonlyArray<
    Parameters<typeof deriveAnchorObligation>[0]["inscriptions"][number] & {
      choreographyId: string;
    }
  >;
  documents: ReadonlyMap<string, DocumentedComprobante[]>;
}): Promise<BulkEmission> {
  const ptoVta = readConfiguredPtoVta();
  const plans: Record<string, BulkEmissionPlan> = {};
  const kinds = new Set<KnownComprobanteKind>();

  for (const row of input.rows) {
    const plan = planAnchorEmission(
      deriveAnchorObligation({
        financialStatus: row.financialStatus,
        inscriptions: input.inscriptions.filter(
          (inscription) => inscription.choreographyId === row.id,
        ),
        comprobantes: input.documents.get(row.id) ?? [],
      }),
    );

    if (plan.ok) {
      plans[row.id] = { status: "ready", kind: plan.kind, amount: plan.amount };
      kinds.add(plan.kind);
    } else {
      plans[row.id] = {
        status: "skipped",
        reasons: plan.reasons.map(emissionRefusalLabel),
      };
    }
  }

  const [floors, reservation] = await Promise.all([
    Promise.all(
      [...kinds].map(async (kind) => {
        const bounds = await readKindCbteFchBounds({ ptoVta, kind });

        return [
          kind,
          { floor: bounds.floor, description: describeCbteFchFloor(bounds) },
        ] as const;
      }),
    ),
    findLiveReservation(ptoVta),
  ]);

  return {
    plans,
    cbteFch: {
      today: getBusinessDateOnly(),
      floors: Object.fromEntries(floors),
    },
    blocked: reservation
      ? { reason: (await blockedBy(reservation)).message }
      : null,
  };
}
