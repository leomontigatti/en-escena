/**
 * `Pagar seña` and `Pagar saldo` as **list actions** over several selected
 * choreographies at once.
 *
 * A preset is nothing but a pre-filled figure. It reads each active
 * inscription's shortfall against the requested threshold and funds exactly
 * that from the academy's `Saldo disponible`, through the very same
 * `spreadFromPool` a hand-typed amount goes through. What lands in
 * `payment_allocation` is a plain `(payment, inscription, amount)` row: nothing
 * in the data says a preset wrote it, and nothing downstream may branch on it.
 *
 * The chosen price is applied **only to inscriptions that have not covered their
 * deposit yet**, because that crossing is what fixes the price. A preset never
 * moves the price out from under an inscription whose deposit is already paid.
 *
 * The whole run is one transaction: a pool that dries up on the last
 * choreography rolls the first one back, so an administrator who sees a refusal
 * can trust that nothing moved.
 */

import { and, asc, eq, inArray } from "drizzle-orm";

import {
  choreographies,
  choreographyDancers,
  dancers,
  events,
  prices,
  scheduleCapacities,
} from "@/db/schema";
import { activeInscription } from "@/lib/choreographies/active-inscription";
import { choreographyNotFoundMessage } from "@/lib/choreographies/choreography-messages";
import { pickDepositDoesNotFitMessage } from "@/lib/finances/choreography-cobro-refusals";
import { resolveChoreographyPricingScheduleId } from "@/lib/finances/choreography-pricing-schedule";
import { formatDancerName } from "@/lib/finances/formatters";
import { hasCrossedDepositThreshold } from "@/lib/finances/inscription-financial-status";
import {
  readInscriptionThresholds,
  type InscriptionThresholdResolution,
} from "@/lib/finances/inscription-thresholds.server";
import { seminarOverAllocatedMessage } from "@/lib/finances/seminar-cobro-refusals";
import { planThresholdCharge } from "@/lib/finances/threshold-charge";
import { lockPriceRows } from "@/lib/prices/rows.server";

import { choreographyTarget } from "./allocation-target.server";
import {
  readInscriptionAllocatedAmount,
  spreadFromPool,
} from "./allocation-pool.server";
import {
  loadCandidatePriceRow,
  runCobro,
  type CobroResult,
  type Transaction,
} from "./choreography-cobro-support.server";
import { choreographyMoney } from "./inscription-money-choreography.server";

/**
 * The threshold a cobro preset settles against: `deposit` allocates up to the
 * `Seña`, `balance` up to the `Total`.
 */
export type CobroStage = "deposit" | "balance";

/**
 * The price the administrator picked, keyed by group type. One entry per group
 * type present in the selection: the picker filters to the choreography's group
 * type, so a selection spanning two group types asks twice. A missing entry is
 * not an error — the inscription keeps whatever price already resolves for it —
 * unless the row it stores is of another group type: funding it would freeze
 * that row (#660).
 */
export type PresetPriceSelection = Record<string, string>;

const inscriptionNotFoundMessage = "No encontramos esa inscripción.";

const groupTypeWithoutPriceMessage =
  "Elegí un precio para cada tipo de grupo: hay inscripciones que guardan el precio de otro tipo de grupo.";

type PresetChoreography = {
  groupType: string;
  id: string;
  scheduleId: string;
};

export async function payChoreographiesPreset(input: {
  academyId: string;
  choreographyIds: string[];
  eventId: string;
  priceIdByGroupType: PresetPriceSelection;
  stage: CobroStage;
}): Promise<CobroResult> {
  const choreographyIds = [...new Set(input.choreographyIds)];

  if (choreographyIds.length === 0) {
    return { ok: false, message: "Elegí al menos una coreografía." };
  }

  return await runCobro(async (tx) => {
    const inscriptions = await tx
      .select({
        choreographyId: choreographyDancers.choreographyId,
        id: choreographyDancers.id,
        selectedPriceId: choreographyDancers.selectedPriceId,
        waivedAt: choreographyDancers.waivedAt,
      })
      .from(choreographyDancers)
      .where(
        and(
          inArray(choreographyDancers.choreographyId, choreographyIds),
          activeInscription(),
        ),
      )
      // The lock the waiver and the pool take, in the same id order: a waiver
      // racing this preset either commits first, and is read here, or waits
      // until the preset has priced and funded.
      .orderBy(asc(choreographyDancers.id))
      .for("update");

    // Read once the inscriptions are locked: a draft save moving a group type
    // holds them until it commits, so each price is picked against the
    // committed group type (#660). A foreign id is refused here, and the
    // rollback releases what it locked.
    const selected = await readSelectedChoreographies(tx, {
      academyId: input.academyId,
      choreographyIds,
      eventId: input.eventId,
    });

    if (selected.length !== choreographyIds.length) {
      return { ok: false, message: choreographyNotFoundMessage };
    }

    if (inscriptions.length === 0) {
      return {
        ok: false,
        message: "Las coreografías elegidas no tienen inscripciones activas.",
      };
    }

    const priced = await applySelectedPrices(tx, {
      choreographies: selected,
      eventId: input.eventId,
      inscriptions,
      priceIdByGroupType: input.priceIdByGroupType,
    });

    if (!priced.ok) {
      return priced;
    }

    const event = await tx.query.events.findFirst({
      columns: { requiredDepositPercentage: true },
      where: eq(events.id, input.eventId),
    });

    if (!event) {
      return { ok: false, message: "No encontramos ese evento." };
    }

    const { requiredDepositPercentage } = event;
    const crossed = await coverPickedDeposits(tx, {
      academyId: input.academyId,
      eventId: input.eventId,
      pickedAmounts: priced.pickedAmounts,
      requiredDepositPercentage,
    });

    if (!crossed.ok) {
      return crossed;
    }

    return await fundOwedThreshold(tx, {
      academyId: input.academyId,
      eventId: input.eventId,
      inscriptionIds: inscriptions.map((inscription) => inscription.id),
      pickedInscriptionIds: new Set(priced.pickedAmounts.keys()),
      requiredDepositPercentage,
      stage: input.stage,
    });
  });
}

/**
 * Funds each picked inscription up to the deposit of the row it was just given.
 * Below that deposit the thresholds read today's row, so what is owed can only
 * be read off the pick once the money has crossed it, which is what fixes the
 * price and lets the read reach the live `Descuento por bailarín` on that row.
 * A pick at today's amount owes the same either way and is left to that read:
 * its deposit can sit above its discounted total, which the pool would refuse.
 *
 * A deposit past what today's row owes is refused here with the reason. One past
 * the pick's own discounted total shows only once the money crossed, in
 * `fundOwedThreshold`: the discount on the pick needs the row fixed first.
 */
async function coverPickedDeposits(
  tx: Transaction,
  input: {
    academyId: string;
    eventId: string;
    pickedAmounts: ReadonlyMap<string, number>;
    requiredDepositPercentage: number;
  },
): Promise<CobroResult> {
  const thresholds = await readInscriptionThresholds(tx, {
    academyId: input.academyId,
    eventId: input.eventId,
    inscriptionIds: [...input.pickedAmounts.keys()],
  });

  for (const [inscriptionId, priceAmount] of input.pickedAmounts) {
    const resolution = thresholds.get(inscriptionId);

    if (!resolution) {
      return { ok: false, message: inscriptionNotFoundMessage };
    }

    if (resolution.priceAmount === priceAmount) {
      continue;
    }

    const { allocatedAmount, totalAmount } = resolution;
    // Below the deposit by construction: a pick reaches no row past it. The
    // discount stays out, since it moves the total and never the deposit.
    const { moves } = planThresholdCharge({
      allocatedAmount,
      covered: false,
      priceRow: { amount: priceAmount },
      requiredDepositPercentage: input.requiredDepositPercentage,
      stage: "deposit",
    });

    for (const amount of moves) {
      if (totalAmount !== null && allocatedAmount + amount > totalAmount) {
        return {
          ok: false,
          message: await pickDepositRefusal(tx, inscriptionId, priceAmount),
        };
      }

      const result = await spreadFromPool(tx, {
        academyId: input.academyId,
        amount,
        eventId: input.eventId,
        target: choreographyTarget(inscriptionId),
      });

      if (!result.ok) {
        return result;
      }
    }
  }

  return { ok: true };
}

/**
 * The heart of the cobro presets: allocates each inscription **exactly what it
 * owes** against the requested stage, out of the academy's pool. Owed is
 * planned here, on the write path, from the row and the live discount the read
 * path resolves, so a preset cannot over-allocate. An inscription that already
 * covered the threshold is skipped rather than failing: the preset is
 * idempotent.
 */
async function fundOwedThreshold(
  tx: Transaction,
  input: {
    academyId: string;
    eventId: string;
    inscriptionIds: string[];
    pickedInscriptionIds: ReadonlySet<string>;
    requiredDepositPercentage: number;
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
      return { ok: false, message: inscriptionNotFoundMessage };
    }

    // A waived inscription owes nothing whatever its price.
    if (resolution.waived) {
      continue;
    }

    const allocatedAmount = await readInscriptionAllocatedAmount(
      tx,
      choreographyTarget(inscriptionId),
    );
    const { overAllocatedAmount, owedAmount } = planResolvedCharge({
      allocatedAmount,
      requiredDepositPercentage: input.requiredDepositPercentage,
      resolution,
      stage: input.stage,
    });
    const refusal = await refusePick(tx, {
      allocatedAmount,
      inscriptionId,
      overAllocatedAmount,
      owedAmount,
      picked: input.pickedInscriptionIds.has(inscriptionId),
      resolution,
    });

    if (refusal) {
      return { ok: false, message: refusal };
    }

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
      target: choreographyTarget(inscriptionId),
    });

    if (!result.ok) {
      return result;
    }
  }

  return { ok: true };
}

/**
 * The charge against the row the read path resolves, with its live discount:
 * past the crossing that is the stored row, so its deposit answers `covered`.
 */
function planResolvedCharge(input: {
  allocatedAmount: number;
  requiredDepositPercentage: number;
  resolution: InscriptionThresholdResolution;
  stage: CobroStage;
}) {
  const { allocatedAmount, resolution } = input;

  return planThresholdCharge({
    allocatedAmount,
    covered: hasCrossedDepositThreshold({
      allocatedAmount,
      depositAmount: resolution.depositAmount,
    }),
    dancerDiscountAmount: resolution.dancerDiscountAmount,
    priceRow:
      resolution.priceAmount === null
        ? null
        : { amount: resolution.priceAmount },
    requiredDepositPercentage: input.requiredDepositPercentage,
    stage: input.stage,
  });
}

/**
 * Why a picked row cannot be charged, if it cannot. At
 * `Pagar saldo` a row whose deposit tops its total charges that total and never
 * reaches the deposit, so only money landing past the total is refused.
 */
async function refusePick(
  tx: Transaction,
  input: {
    allocatedAmount: number;
    inscriptionId: string;
    overAllocatedAmount: number;
    owedAmount: number | null;
    picked: boolean;
    resolution: InscriptionThresholdResolution;
  },
): Promise<string | null> {
  const { inscriptionId, overAllocatedAmount, resolution } = input;
  const { depositAmount, priceAmount, totalAmount } = resolution;

  if (
    !input.picked ||
    priceAmount === null ||
    depositAmount === null ||
    totalAmount === null
  ) {
    return null;
  }

  if (
    depositAmount > totalAmount &&
    input.allocatedAmount + (input.owedAmount ?? 0) > totalAmount
  ) {
    return await pickDepositRefusal(tx, inscriptionId, priceAmount);
  }

  return overAllocatedAmount
    ? await overAllocatedPickMessage(tx, inscriptionId, overAllocatedAmount)
    : null;
}

async function pickDepositRefusal(
  tx: Transaction,
  inscriptionId: string,
  priceAmount: number,
): Promise<string> {
  return pickDepositDoesNotFitMessage({
    personName: await readDancerName(tx, inscriptionId),
    priceAmount,
  });
}

/** A pick below the money on the row would fix a price it already exceeds. */
async function overAllocatedPickMessage(
  tx: Transaction,
  inscriptionId: string,
  overAllocatedAmount: number,
): Promise<string> {
  return `${seminarOverAllocatedMessage({
    overAllocatedAmount,
    personName: await readDancerName(tx, inscriptionId),
  })} Quitale la diferencia desde su detalle antes de asignar.`;
}

async function readDancerName(
  tx: Transaction,
  inscriptionId: string,
): Promise<string> {
  const [person] = await tx
    .select({ firstName: dancers.firstName, lastName: dancers.lastName })
    .from(choreographyDancers)
    .innerJoin(dancers, eq(dancers.id, choreographyDancers.dancerId))
    .where(eq(choreographyDancers.id, inscriptionId));

  if (!person) {
    throw new Error(`Expected a dancer on inscription ${inscriptionId}.`);
  }

  return formatDancerName(person);
}

/**
 * Funding an inscription below its deposit with no pick for its own group type
 * would cover the deposit of the row it stores, and freeze it there when that
 * row is of another group type: the state the roster save refuses to leave
 * behind (#660). One already past it is frozen whatever the preset does.
 */
function storesRowOfAnotherGroupType(input: {
  choreography: PresetChoreography;
  inscription: { selectedPriceId: string | null };
  storedGroupTypes: Map<string, string>;
}) {
  const { selectedPriceId } = input.inscription;
  const storedGroupType = selectedPriceId
    ? input.storedGroupTypes.get(selectedPriceId)
    : undefined;

  return (
    storedGroupType !== undefined &&
    storedGroupType !== input.choreography.groupType
  );
}

/** The group type of each row the inscriptions store, by price id. */
async function readStoredGroupTypes(
  tx: Transaction,
  inscriptions: Array<{ selectedPriceId: string | null }>,
): Promise<Map<string, string>> {
  const priceIds = [
    ...new Set(
      inscriptions.flatMap(({ selectedPriceId }) =>
        selectedPriceId ? [selectedPriceId] : [],
      ),
    ),
  ];

  if (priceIds.length === 0) {
    return new Map();
  }

  const rows = await tx
    .select({ groupType: prices.groupType, id: prices.id })
    .from(prices)
    .where(inArray(prices.id, priceIds));

  return new Map(rows.map((row) => [row.id, row.groupType]));
}

/**
 * The selected choreographies, scoped to the academy and event of the list the
 * action was fired from. A row missing here is a row that does not belong to
 * this list, which is why the caller compares counts instead of trusting ids
 * that arrived in a form.
 */
async function readSelectedChoreographies(
  tx: Transaction,
  input: { academyId: string; choreographyIds: string[]; eventId: string },
): Promise<PresetChoreography[]> {
  const rows = await tx
    .select({
      choreographyScheduleId: choreographies.scheduleId,
      groupType: choreographies.groupType,
      id: choreographies.id,
      scheduleCapacityScheduleId: scheduleCapacities.scheduleId,
    })
    .from(choreographies)
    .leftJoin(
      scheduleCapacities,
      eq(choreographies.scheduleCapacityId, scheduleCapacities.id),
    )
    .where(
      and(
        eq(choreographies.academyId, input.academyId),
        eq(choreographies.eventId, input.eventId),
        inArray(choreographies.id, input.choreographyIds),
      ),
    );

  return rows.map((row) => ({
    groupType: row.groupType,
    id: row.id,
    scheduleId: resolveChoreographyPricingScheduleId(row),
  }));
}

/**
 * Fixes the picked price on the inscriptions that can still take one. An
 * inscription that already **covers its deposit** keeps its price: that is the lock
 * the crossing puts on it, enforced here rather than only in the dialog. One
 * that holds money but has not covered it yet still takes the picked row — below
 * the threshold nothing is fixed, which is exactly what the deposit buys.
 *
 * A price that does not belong to the choreography's candidate set — wrong
 * group type, or a row tied to another schedule — refuses the whole preset. The
 * alternative, silently ignoring it, would allocate against a figure the
 * administrator never saw.
 */
async function applySelectedPrices(
  tx: Transaction,
  input: {
    choreographies: PresetChoreography[];
    eventId: string;
    inscriptions: Array<{
      choreographyId: string;
      id: string;
      selectedPriceId: string | null;
      waivedAt: Date | null;
    }>;
    priceIdByGroupType: PresetPriceSelection;
  },
): Promise<
  | { ok: false; message: string }
  | { ok: true; pickedAmounts: Map<string, number> }
> {
  const pickedAmounts = new Map<string, number>();
  const byId = new Map(
    input.choreographies.map((choreography) => [choreography.id, choreography]),
  );

  // Every row the loop below can lock, all at once and in order, before it
  // takes them one by one through `loadCandidatePriceRow`: two presets picking
  // the same rows cannot deadlock.
  await lockPriceRows(tx, Object.values(input.priceIdByGroupType));

  const storedGroupTypes = await readStoredGroupTypes(tx, input.inscriptions);

  for (const inscription of input.inscriptions) {
    const choreography = byId.get(inscription.choreographyId);
    const priceId = choreography
      ? input.priceIdByGroupType[choreography.groupType]
      : undefined;

    // A waived inscription owes nothing whatever its price, so a pick does not
    // reach it: it keeps the row it goes back to if the waiver is taken off.
    if (!choreography || inscription.waivedAt !== null) {
      continue;
    }

    const crossed = await choreographyMoney.hasCrossedStored(
      tx,
      inscription,
      await readInscriptionAllocatedAmount(
        tx,
        choreographyTarget(inscription.id),
      ),
    );

    if (crossed) {
      continue;
    }

    if (!priceId) {
      if (
        storesRowOfAnotherGroupType({
          choreography,
          inscription,
          storedGroupTypes,
        })
      ) {
        return { ok: false, message: groupTypeWithoutPriceMessage };
      }

      continue;
    }

    const price = await loadCandidatePriceRow(tx, {
      eventId: input.eventId,
      groupType: choreography.groupType,
      priceId,
      scheduleId: choreography.scheduleId,
    });

    if (!price) {
      return {
        ok: false,
        message: "Esa fila de precio no corresponde a la coreografía elegida.",
      };
    }

    await tx
      .update(choreographyDancers)
      .set({ selectedPriceId: price.id })
      .where(eq(choreographyDancers.id, inscription.id));
    pickedAmounts.set(inscription.id, price.amount);
  }

  return { ok: true, pickedAmounts };
}
