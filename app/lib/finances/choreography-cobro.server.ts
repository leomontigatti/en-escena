import { eq } from "drizzle-orm";

import { db } from "@/db";
import { choreographyDancers, events, prices } from "@/db/schema";
import { resolveChoreographyPricingScheduleId } from "@/lib/finances/choreography-pricing-schedule";
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
  loadCandidatePriceRow,
  loadChoreographyScheduleRow,
  loadCobroContext,
  resolveApplicablePriceRow,
  resolveInscriptionDepositFloor,
  selectApplicablePriceRow,
  type CobroResult,
  type Transaction,
} from "./choreography-cobro-support.server";

export { readChoreographyLadderStages } from "./choreography-cobro-support.server";

export {
  deletePaymentAllocation,
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
 * A refusal raised from inside a cobro transaction. Returning `{ ok: false }`
 * from a Drizzle transaction callback **commits**, so a preset that refuses
 * halfway — the pool running dry on the third inscription — would leave the
 * earlier inscriptions funded and every snapshot frozen. Throwing rolls back;
 * `runCobro` turns it back into the `CobroResult` the caller expects.
 */
class CobroRefusal extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = "CobroRefusal";
  }
}

/**
 * Runs a cobro inside a transaction where **any** refusal rolls back. Every
 * cobro is all-or-nothing: an administrator who sees an error has to be able to
 * trust that nothing moved.
 */
export async function runCobro(
  run: (tx: Transaction) => Promise<CobroResult>,
): Promise<CobroResult> {
  try {
    return await db.transaction(async (tx) => {
      const result = await run(tx);

      if (!result.ok) {
        throw new CobroRefusal(result.message);
      }

      return result;
    });
  } catch (thrown) {
    if (thrown instanceof CobroRefusal) {
      return { ok: false, message: thrown.reason };
    }

    throw thrown;
  }
}

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
 * Extraordinary deposit charge for **a single orphan inscription** in a mixed
 * choreography. Unlike the whole-choreography flow, the administrator picks the
 * price row (it is not derived from a date) and only that inscription's
 * snapshot is frozen; its siblings are untouched.
 *
 * Rules enforced on the server:
 * - The target inscription must be `impaga`.
 * - Only proceeds on **mixed** choreographies (some sibling already `señada` or
 *   `pagada`); on a 100% `impaga` choreography the first freeze is the one from
 *   the normal whole-choreography flow.
 * - The chosen row must belong to the candidate set (same `groupType` and
 *   schedule) and sit between the floor (`min(frozenBasePriceAmount)` over the
 *   active siblings already `señada`/`pagada`) and the ceiling (today's price).
 */
export async function payInscriptionDeposit(input: {
  academyId: string;
  choreographyId: string;
  eventId: string;
  inscriptionId: string;
  priceId: string;
}): Promise<CobroResult> {
  return await runCobro(async (tx) => {
    const context = await loadCobroContext(tx, input);
    if (!context.ok) {
      return context;
    }

    const { choreography, event, inscriptions } = context;

    const target = inscriptions.find(
      (inscription) => inscription.id === input.inscriptionId,
    );
    if (!target) {
      return { ok: false, message: "No encontramos esa inscripción." };
    }

    if (deriveInscriptionLadderStage(target) !== "impaga") {
      return {
        ok: false,
        message: "Esta inscripción ya tiene la seña congelada.",
      };
    }

    const floor = resolveInscriptionDepositFloor(inscriptions, target.id);
    if (floor === null) {
      return {
        ok: false,
        message:
          "El cobro por inscripción solo aplica en coreografías con otra inscripción ya señada.",
      };
    }

    const price = await loadCandidatePriceRow(tx, {
      eventId: input.eventId,
      groupType: choreography.groupType,
      priceId: input.priceId,
      scheduleId: choreography.scheduleId,
    });
    if (!price) {
      return { ok: false, message: "No encontramos esa fila de precio." };
    }

    if (price.amount < floor) {
      return {
        ok: false,
        message:
          "La fila de precio no puede ser menor que el piso de la coreografía.",
      };
    }

    const referenceDate = getBusinessDateOnly();

    // Ceiling: today's price, never below the floor (matching what the first
    // deposited sibling paid is always valid). No deposit may be charged above
    // that ceiling.
    const ceilingPrice = await resolveApplicablePriceRow(tx, {
      eventId: input.eventId,
      groupType: choreography.groupType,
      referenceDate,
      scheduleId: choreography.scheduleId,
    });

    if (ceilingPrice && price.amount > Math.max(floor, ceilingPrice.amount)) {
      return {
        ok: false,
        message:
          "La fila de precio no puede superar el precio vigente al día de hoy.",
      };
    }

    const depositAmount = calculateDepositAmount({
      priceAmount: price.amount,
      requiredDepositPercentage: event.requiredDepositPercentage,
    });

    await tx
      .update(choreographyDancers)
      .set({
        frozenBasePriceAmount: price.amount,
        selectedPriceId: price.id,
        depositReferenceDate: referenceDate,
        depositPercentage: event.requiredDepositPercentage,
        depositAmount,
      })
      .where(eq(choreographyDancers.id, target.id));

    return await fundOwedThreshold(tx, {
      academyId: input.academyId,
      eventId: input.eventId,
      inscriptionIds: [target.id],
      stage: "deposit",
    });
  });
}

/**
 * Options for the per-inscription deposit charge of a choreography. Returns
 * `null` when the choreography is **not** mixed (no `impaga` orphan with at
 * least one `señada`/`pagada` sibling), which is when this flow is not offered.
 * The candidate price rows are those of the same `groupType` and schedule,
 * bounded between the **floor** (`min(frozenBasePriceAmount)` of the already
 * frozen siblings) and the **ceiling**: today's applicable price. No price
 * below what the first deposited sibling paid, and none above today's, is
 * offered.
 */
export async function readInscriptionDepositOptions(input: {
  choreographyId: string;
  eventId: string;
}): Promise<{
  floor: number;
  priceRows: Array<{
    id: string;
    name: string;
    amount: number;
    depositAmount: number;
  }>;
} | null> {
  const choreographyRow = await loadChoreographyScheduleRow(
    db,
    input.choreographyId,
  );

  if (!choreographyRow) {
    return null;
  }

  const [event, inscriptions] = await Promise.all([
    db.query.events.findFirst({
      columns: { requiredDepositPercentage: true },
      where: eq(events.id, input.eventId),
    }),
    db.query.choreographyDancers.findMany({
      where: eq(choreographyDancers.choreographyId, input.choreographyId),
    }),
  ]);

  if (!event) {
    return null;
  }

  const floor = resolveInscriptionDepositFloor(inscriptions, null);
  const hasOrphan = inscriptions.some(
    (inscription) => deriveInscriptionLadderStage(inscription) === "impaga",
  );
  if (floor === null || !hasOrphan) {
    return null;
  }

  const scheduleId = resolveChoreographyPricingScheduleId(choreographyRow);
  const groupTypePrices = (
    await db.query.prices.findMany({ where: eq(prices.eventId, input.eventId) })
  ).filter((price) => price.groupType === choreographyRow.groupType);

  // Ceiling: today's price, resolved with the same rule as the charge itself
  // (schedule-specific over general). Never below the floor: matching the price
  // the first deposited sibling paid is always valid, even when a cheaper
  // deadline rules today. With no applicable price today no ceiling is imposed,
  // so the rows are not all hidden.
  const ceilingPrice = selectApplicablePriceRow({
    priceRows: groupTypePrices,
    referenceDate: getBusinessDateOnly(),
    scheduleId,
  });
  const ceiling =
    ceilingPrice === null ? null : Math.max(floor, ceilingPrice.amount);

  const priceRows = groupTypePrices
    .filter(
      (price) =>
        (price.scheduleId === null || price.scheduleId === scheduleId) &&
        price.amount >= floor &&
        (ceiling === null || price.amount <= ceiling),
    )
    .map((price) => ({
      id: price.id,
      name: price.name,
      amount: price.amount,
      depositAmount: calculateDepositAmount({
        priceAmount: price.amount,
        requiredDepositPercentage: event.requiredDepositPercentage,
      }),
    }))
    .sort((a, b) => a.amount - b.amount);

  return { floor, priceRows };
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
 * Extraordinary balance charge for **a single orphan `señada` inscription** in
 * a mixed choreography. Unlike the whole-choreography flow, only that
 * inscription's balance snapshot is frozen; its siblings are untouched.
 *
 * Rules enforced on the server:
 * - The target inscription must be `señada` (deposit frozen, balance pending).
 * - Only proceeds on **mixed** choreographies (some sibling in another state);
 *   on a 100% `señada` choreography the first balance freeze is the one from
 *   the normal whole-choreography flow.
 * - The `Descuento por bailarín` is computed against the dancer's live roster,
 *   the same as the read path.
 */
export async function payInscriptionBalance(input: {
  academyId: string;
  choreographyId: string;
  eventId: string;
  inscriptionId: string;
}): Promise<CobroResult> {
  return await runCobro(async (tx) => {
    const context = await loadCobroContext(tx, input);
    if (!context.ok) {
      return context;
    }

    const { inscriptions } = context;

    const target = inscriptions.find(
      (inscription) => inscription.id === input.inscriptionId,
    );
    if (!target) {
      return { ok: false, message: "No encontramos esa inscripción." };
    }

    if (deriveInscriptionLadderStage(target) !== "señada") {
      return {
        ok: false,
        message: "Esta inscripción no tiene un saldo pendiente de cobro.",
      };
    }

    if (
      inscriptions.every(
        (inscription) => deriveInscriptionLadderStage(inscription) === "señada",
      )
    ) {
      return {
        ok: false,
        message:
          "El cobro de saldo por inscripción solo aplica en coreografías mixtas; usá Pagar saldo.",
      };
    }

    const frozen = await freezeBalanceSnapshots(tx, {
      academyId: input.academyId,
      eventId: input.eventId,
      inscriptions: [target],
    });
    if (!frozen.ok) {
      return frozen;
    }

    return await fundOwedThreshold(tx, {
      academyId: input.academyId,
      eventId: input.eventId,
      inscriptionIds: [target.id],
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
