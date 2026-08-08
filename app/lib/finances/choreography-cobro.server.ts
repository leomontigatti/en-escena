import { eq } from "drizzle-orm";

import { choreographyDancers } from "@/db/schema";
import { getBusinessDateOnly } from "@/lib/shared/business-time-zone";
import {
  calculateDepositAmount,
  deriveInscriptionFinancialFigures,
} from "@/lib/finances/inscription-financial-status";
import { deriveInscriptionLadderStage } from "@/lib/finances/inscription-ladder-snapshot";
import { readInscriptionThresholds } from "@/lib/finances/inscription-thresholds.server";

import {
  readInscriptionAllocatedAmount,
  spreadFromPool,
} from "./allocation-pool.server";
import {
  loadCobroContext,
  resolveApplicablePriceRow,
  runCobro,
  type CobroResult,
  type Transaction,
} from "./choreography-cobro-support.server";

export { readChoreographyLadderStages } from "./choreography-cobro-support.server";

export {
  releaseInscriptionAllocations,
  syncInscriptionSnapshots,
} from "./choreography-cobro-allocations.server";
export type { CobroResult };

/**
 * The threshold a cobro preset settles against: `deposit` allocates up to the
 * `Seña`, `balance` up to the `Total`. It is the same scale the detail screen
 * names its stage with, so both sides share one type.
 */
export type CobroStage = "deposit" | "balance";

/**
 * `Pagar seña` for a whole choreography. Only proceeds when every active
 * inscription is `impaga`. Freezes the deposit snapshot (base price, deposit
 * and the price row applicable today) and allocates each inscription what it
 * owes against its deposit, taken from the academy's `Saldo disponible`.
 *
 * No payment is named any more: the preset resolves an amount and the pool
 * decides which payments it comes from.
 */
export async function payChoreographyDeposit(input: {
  academyId: string;
  choreographyId: string;
  eventId: string;
}): Promise<CobroResult> {
  return await runCobro(async (tx) => {
    const context = await loadCobroContext(tx, input);
    if (!context.ok) {
      return context;
    }

    const { choreography, event, inscriptions } = context;

    if (
      !inscriptions.every(
        (inscription) => deriveInscriptionLadderStage(inscription) === "impaga",
      )
    ) {
      return {
        ok: false,
        message:
          "Solo se puede pagar la seña si todas las inscripciones están impagas.",
      };
    }

    const referenceDate = getBusinessDateOnly();
    const price = await resolveApplicablePriceRow(tx, {
      eventId: input.eventId,
      groupType: choreography.groupType,
      referenceDate,
      scheduleId: choreography.scheduleId,
    });

    if (!price) {
      return {
        ok: false,
        message:
          "No hay un precio configurado para este tipo de grupo y cronograma.",
      };
    }

    const depositAmount = calculateDepositAmount({
      priceAmount: price.amount,
      requiredDepositPercentage: event.requiredDepositPercentage,
    });

    for (const inscription of inscriptions) {
      // An inscription that already holds money has its price fixed — the
      // database's guard trigger refuses to move `selectedPriceId` under it —
      // so the preset leaves it alone and only tops it up to its own deposit.
      if ((await readInscriptionAllocatedAmount(tx, inscription.id)) > 0) {
        continue;
      }

      await tx
        .update(choreographyDancers)
        .set({
          frozenBasePriceAmount: price.amount,
          selectedPriceId: price.id,
          depositReferenceDate: referenceDate,
          depositPercentage: event.requiredDepositPercentage,
          depositAmount,
        })
        .where(eq(choreographyDancers.id, inscription.id));
    }

    return await fundOwedThreshold(tx, {
      academyId: input.academyId,
      eventId: input.eventId,
      inscriptionIds: inscriptions.map((inscription) => inscription.id),
      stage: "deposit",
    });
  });
}

/**
 * `Pagar saldo` for a whole choreography. Only proceeds when every active
 * inscription is `señada`. Freezes the balance snapshot — including the live
 * `Descuento por bailarín` — and allocates each inscription what it owes
 * against its total, taken from the academy's `Saldo disponible`.
 */
export async function payChoreographyBalance(input: {
  academyId: string;
  choreographyId: string;
  eventId: string;
}): Promise<CobroResult> {
  return await runCobro(async (tx) => {
    const context = await loadCobroContext(tx, input);
    if (!context.ok) {
      return context;
    }

    const { inscriptions } = context;

    if (
      !inscriptions.every(
        (inscription) => deriveInscriptionLadderStage(inscription) === "señada",
      )
    ) {
      return {
        ok: false,
        message:
          "Solo se puede pagar el saldo si todas las inscripciones están señadas.",
      };
    }

    const frozen = await freezeBalanceSnapshots(tx, {
      academyId: input.academyId,
      eventId: input.eventId,
      inscriptions,
    });
    if (!frozen.ok) {
      return frozen;
    }

    return await fundOwedThreshold(tx, {
      academyId: input.academyId,
      eventId: input.eventId,
      inscriptionIds: inscriptions.map((inscription) => inscription.id),
      stage: "balance",
    });
  });
}

/**
 * Freezes the balance snapshot of the given inscriptions against the same
 * thresholds the screen reads: the total comes from `readInscriptionThresholds`,
 * not from a count of its own. The frozen columns are still written because the
 * per-row charge still reads them; they die with the ladder.
 */
async function freezeBalanceSnapshots(
  tx: Transaction,
  input: {
    academyId: string;
    eventId: string;
    inscriptions: Array<{ id: string; depositAmount: number | null }>;
  },
): Promise<CobroResult> {
  const referenceDate = getBusinessDateOnly();
  const thresholds = await readInscriptionThresholds(tx, {
    academyId: input.academyId,
    eventId: input.eventId,
    inscriptionIds: input.inscriptions.map((inscription) => inscription.id),
  });

  for (const inscription of input.inscriptions) {
    const resolution = thresholds.get(inscription.id);

    if (!resolution || resolution.totalAmount === null) {
      return {
        ok: false,
        message:
          "No hay un precio configurado para este tipo de grupo y cronograma.",
      };
    }

    const depositAmount =
      inscription.depositAmount ?? resolution.depositAmount ?? 0;

    await tx
      .update(choreographyDancers)
      .set({
        balanceReferenceDate: referenceDate,
        appliedDancerDiscountPercentage: resolution.dancerDiscountPercentage,
        appliedDancerDiscountAmount: resolution.dancerDiscountAmount,
        finalTotalAmount: resolution.totalAmount,
        balanceAmount: Math.max(0, resolution.totalAmount - depositAmount),
        balanceCompletedAt: referenceDate,
      })
      .where(eq(choreographyDancers.id, inscription.id));
  }

  return { ok: true };
}

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
