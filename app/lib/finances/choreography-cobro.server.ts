import { deriveInscriptionFinancialFigures } from "@/lib/finances/inscription-financial-status";
import { readInscriptionThresholds } from "@/lib/finances/inscription-thresholds.server";

import {
  readInscriptionAllocatedAmount,
  spreadFromPool,
} from "./allocation-pool.server";
import type {
  CobroResult,
  Transaction,
} from "./choreography-cobro-support.server";

export type { CobroResult };

/**
 * The threshold a cobro preset settles against: `deposit` allocates up to the
 * `Seña`, `balance` up to the `Total`.
 */
export type CobroStage = "deposit" | "balance";

/**
 * The heart of the cobro presets: allocates each inscription **exactly what it
 * owes** against the requested stage, out of the academy's pool. Owed is
 * computed here, on the write path, through the same owner the read path uses,
 * so a preset cannot over-allocate. An inscription that already covered the
 * threshold is skipped rather than failing: the preset is idempotent.
 */
export async function fundOwedThreshold(
  tx: Transaction,
  input: {
    academyId: string;
    eventId: string;
    inscriptionIds: string[];
    stage: CobroStage;
  },
): Promise<CobroResult> {
  const thresholds = await readInscriptionThresholds(tx, {
    academyId: input.academyId,
    eventId: input.eventId,
    inscriptionIds: input.inscriptionIds,
  });

  for (const inscriptionId of input.inscriptionIds) {
    const resolution = thresholds.get(inscriptionId);

    if (!resolution) {
      return { ok: false, message: "No encontramos esa inscripción." };
    }

    const figures = deriveInscriptionFinancialFigures({
      allocatedAmount: await readInscriptionAllocatedAmount(tx, inscriptionId),
      thresholds: resolution,
    });
    const owedAmount =
      input.stage === "deposit"
        ? figures.owedDepositAmount
        : figures.owedBalanceAmount;

    if (owedAmount === null) {
      return {
        ok: false,
        message:
          "No hay un precio configurado para este tipo de grupo y cronograma.",
      };
    }

    if (owedAmount === 0) {
      continue;
    }

    const result = await spreadFromPool(tx, {
      academyId: input.academyId,
      amount: owedAmount,
      eventId: input.eventId,
      inscriptionId,
    });

    if (!result.ok) {
      return result;
    }
  }

  return { ok: true };
}
