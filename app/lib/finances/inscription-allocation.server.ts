/**
 * Putting an arbitrary amount on one choreography inscription, and the price
 * rows its money dialog reads. The gestures that take money off live in
 * `inscription-money.server.ts`.
 *
 * It goes through the pool rules and **does not let the administrator name a
 * payment**: `spreadFromPool` consumes the academy's payments oldest-first, and
 * which payment a peso came from is the system's answer, not a person's.
 *
 * **Adding money is the only direction that refuses, and the only one with a
 * price.** Active over-allocation is rejected by `spreadFromPool` with no
 * override. The price fixes the two thresholds, so it belongs to the moment money
 * lands, and it is locked once the inscription covers its deposit — a rule the
 * database also holds, through the guard trigger on `selected_price_id`.
 */

import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  choreographyDancers,
  events,
  paymentAllocations,
  prices,
} from "@/db/schema";
import { choreographyNotFoundMessage } from "@/lib/choreographies/choreography-messages";
import { resolveChoreographyPricingScheduleId } from "@/lib/finances/choreography-pricing-schedule";
import { calculateDepositAmount } from "@/lib/finances/inscription-financial-status";
import { type ChoreographyGroupType } from "@/lib/finances/operational-summary-calculations.server";
import {
  resolveEffectiveBasePriceRow,
  selectApplicableInscriptionPrice,
} from "@/lib/finances/inscription-price";
import { loadEventPriceRows } from "@/lib/prices/rows.server";
import { getBusinessDateOnly } from "@/lib/shared/business-time-zone";

import {
  choreographyTarget,
  restrictedChoreographyInscriptionId,
} from "./allocation-target.server";
import {
  lockTargetRow,
  readInscriptionAllocatedAmount,
  spreadFromPool,
} from "./allocation-pool.server";
import {
  hasCrossedStoredDepositThreshold,
  loadCandidatePriceRow,
  loadChoreographyScheduleRow,
  runCobro,
  type CobroResult,
  type Transaction,
} from "./choreography-cobro-support.server";

/** A price row the allocation dialog may offer, with its resulting `Seña`. */
export type InscriptionPriceOption = {
  amount: number;
  depositAmount: number;
  id: string;
  name: string;
};

/**
 * The price row the allocation dialog names. It carries its `Seña` for the same
 * reason the options do: locked or not, the control reads the same three figures,
 * so the readout cannot say less than the picker it replaces.
 */
export type InscriptionDialogPrice = {
  amount: number;
  depositAmount: number;
  id: string;
  name: string;
};

/**
 * The price rows the allocation dialog offers, **filtered to the choreography's
 * group type** and to its own schedule. Offering a foreign row would be offering
 * to create a state the model forbids, so the rows are filtered rather than
 * labelled.
 *
 * Unlike the ladder's old candidate set there is no floor and no today's-price
 * ceiling: an arbitrary amount against an arbitrary threshold has no rung to
 * stay between.
 *
 * `paymentDeadline` is deliberately not a filter, here or on the write path
 * (`loadCandidatePriceRow` does not look at it either), so an expired row is
 * both offerable and storable. The deadline decides which price an inscription
 * *would* be charged when nobody has said — that is the read side's
 * `selectApplicableInscriptionPrice`. Here somebody is saying it: an
 * administrator naming the price a late payment settles at is making the call
 * the deadline exists to make in their absence.
 */
export async function readInscriptionPriceOptions(input: {
  choreographyId: string;
  eventId: string;
}): Promise<InscriptionPriceOption[]> {
  const choreographyRow = await loadChoreographyScheduleRow(
    db,
    input.choreographyId,
  );

  if (!choreographyRow) {
    return [];
  }

  const [event, priceRows] = await Promise.all([
    db.query.events.findFirst({
      columns: { requiredDepositPercentage: true },
      where: eq(events.id, input.eventId),
    }),
    loadEventPriceRows(db, input.eventId),
  ]);

  if (!event) {
    return [];
  }

  const scheduleId = resolveChoreographyPricingScheduleId(choreographyRow);

  return priceRows
    .filter(
      (price) =>
        price.groupType === choreographyRow.groupType &&
        (price.scheduleIds.length === 0 ||
          price.scheduleIds.includes(scheduleId)),
    )
    .map((price) => ({
      amount: price.amount,
      depositAmount: calculateDepositAmount({
        priceAmount: price.amount,
        requiredDepositPercentage: event.requiredDepositPercentage,
      }),
      id: price.id,
      name: price.name,
    }))
    .sort((left, right) => left.amount - right.amount);
}

/**
 * The price row each inscription of a choreography is **charged at**, which is
 * the one the allocation dialog reads out: the stored row once the inscription
 * has crossed its deposit threshold, and the row that applies today while it has
 * not.
 *
 * It is the stored row that is read separately from the options, because a
 * locked inscription must show the price it holds even when that row is no
 * longer among the ones on offer. The effective row is resolved on top with
 * `resolveEffectiveBasePriceRow` — the same call the finance readers make — so
 * the dialog and the row behind it cannot name different prices for the same
 * inscription.
 */
export async function readInscriptionEffectivePrices(input: {
  choreographyId: string;
  eventId: string;
}): Promise<Map<string, InscriptionDialogPrice>> {
  const choreographyRow = await loadChoreographyScheduleRow(
    db,
    input.choreographyId,
  );

  if (!choreographyRow) {
    return new Map();
  }

  const [event, priceRows, inscriptionRows] = await Promise.all([
    db.query.events.findFirst({
      columns: { requiredDepositPercentage: true },
      where: eq(events.id, input.eventId),
    }),
    loadEventPriceRows(db, input.eventId),
    db
      .select({
        id: choreographyDancers.id,
        selectedPriceId: choreographyDancers.selectedPriceId,
      })
      .from(choreographyDancers)
      .where(eq(choreographyDancers.choreographyId, input.choreographyId)),
  ]);

  if (!event) {
    return new Map();
  }

  const allocationRows =
    inscriptionRows.length === 0
      ? []
      : await db
          .select({
            amount: paymentAllocations.amount,
            inscriptionId: restrictedChoreographyInscriptionId,
          })
          .from(paymentAllocations)
          .where(
            inArray(
              paymentAllocations.choreographyInscriptionId,
              inscriptionRows.map((row) => row.id),
            ),
          );
  const allocatedByInscription = new Map<string, number>();
  for (const allocation of allocationRows) {
    allocatedByInscription.set(
      allocation.inscriptionId,
      (allocatedByInscription.get(allocation.inscriptionId) ?? 0) +
        allocation.amount,
    );
  }

  const effectivePrices = new Map<string, InscriptionDialogPrice>();
  for (const inscription of inscriptionRows) {
    const price = resolveEffectiveBasePriceRow({
      allocatedAmount: allocatedByInscription.get(inscription.id) ?? 0,
      choreography: {
        choreographyScheduleId: choreographyRow.choreographyScheduleId,
        groupType: choreographyRow.groupType as ChoreographyGroupType,
        scheduleCapacityScheduleId: choreographyRow.scheduleCapacityScheduleId,
      },
      priceRows,
      requiredDepositPercentage: event.requiredDepositPercentage,
      selectedPriceId: inscription.selectedPriceId,
    });

    if (price) {
      effectivePrices.set(inscription.id, {
        amount: price.amount,
        depositAmount: calculateDepositAmount({
          priceAmount: price.amount,
          requiredDepositPercentage: event.requiredDepositPercentage,
        }),
        id: price.id,
        name: price.name,
      });
    }
  }

  return effectivePrices;
}

/**
 * The choreography an inscription belongs to, or `null` when there is no such
 * row. A screen about one choreography asks this before a money gesture, whose
 * scope names no parent.
 */
export async function readInscriptionChoreographyId(
  inscriptionId: string,
): Promise<string | null> {
  const [inscription] = await db
    .select({ choreographyId: choreographyDancers.choreographyId })
    .from(choreographyDancers)
    .where(eq(choreographyDancers.id, inscriptionId));

  return inscription?.choreographyId ?? null;
}

type InscriptionMoneyInput = {
  academyId: string;
  choreographyId: string;
  eventId: string;
  inscriptionId: string;
};

/**
 * Puts an arbitrary amount on one inscription, out of the academy's
 * `Saldo disponible`.
 *
 * `priceId` is the price chosen inside the dialog, and it is only honoured
 * while the inscription has not covered its deposit: from that crossing on, a
 * different row is refused rather than warned about. Any amount is allocatable
 * — a partial one leaves the row reading `Seña pendiente` with its shortfall,
 * which is an ordinary outcome and not an error.
 */
export async function allocateToInscription(
  input: InscriptionMoneyInput & { amount: number; priceId: string | null },
): Promise<CobroResult> {
  return await runCobro(async (tx) => {
    // The pool's lock, taken before the group type is read: a draft save
    // moving the group type holds it until it commits, so the price is picked
    // against the committed one (#660). Only adding money can cross a deposit.
    await tx
      .select({ id: choreographyDancers.id })
      .from(choreographyDancers)
      .where(eq(choreographyDancers.id, input.inscriptionId))
      .for("update");

    const context = await loadInscriptionMoneyContext(tx, input);
    if (!context.ok) {
      return context;
    }

    const allocatedAmount = await readInscriptionAllocatedAmount(
      tx,
      choreographyTarget(input.inscriptionId),
    );
    const priced = await applySelectedPrice(tx, {
      allocatedAmount,
      choreography: context.choreography,
      eventId: input.eventId,
      inscription: context.inscription,
      priceId: input.priceId,
    });
    if (!priced.ok) {
      return priced;
    }

    return await spreadFromPool(tx, {
      academyId: input.academyId,
      amount: input.amount,
      eventId: input.eventId,
      target: choreographyTarget(input.inscriptionId),
    });
  });
}

/**
 * The price the money lands against. While the inscription is **below its
 * deposit threshold** the chosen row is written, whatever it already holds;
 * from the crossing on the price is **locked**, and a different row is refused
 * with the way out named — take enough money off to drop back below the deposit.
 *
 * The threshold is the stored row's, never the incoming one's: see
 * `hasCrossedDepositThreshold`.
 */
async function applySelectedPrice(
  tx: Transaction,
  input: {
    allocatedAmount: number;
    choreography: { groupType: string; scheduleId: string };
    eventId: string;
    inscription: { id: string; selectedPriceId: string | null };
    priceId: string | null;
  },
): Promise<CobroResult> {
  const crossed = await hasCrossedStoredDepositThreshold(tx, {
    allocatedAmount: input.allocatedAmount,
    selectedPriceId: input.inscription.selectedPriceId,
  });

  if (crossed) {
    if (
      input.priceId !== null &&
      input.priceId !== input.inscription.selectedPriceId
    ) {
      return {
        ok: false,
        message:
          "El precio queda fijo desde que la inscripción cubre su seña. Para cambiarlo hay que quitarle dinero hasta dejarla por debajo de la seña.",
      };
    }

    return { ok: true };
  }

  const picked = await resolvePickedPriceId(tx, input);

  if (!picked.ok) {
    return picked;
  }

  if (picked.priceId === null) {
    return { ok: true };
  }

  const price = await loadCandidatePriceRow(tx, {
    eventId: input.eventId,
    groupType: input.choreography.groupType,
    priceId: picked.priceId,
    scheduleId: input.choreography.scheduleId,
  });

  if (!price) {
    return { ok: false, message: "No encontramos esa fila de precio." };
  }

  await tx
    .update(choreographyDancers)
    .set({ selectedPriceId: price.id })
    .where(eq(choreographyDancers.id, input.inscription.id));

  return { ok: true };
}

const storedRowOfAnotherGroupTypeMessage =
  "La inscripción guarda el precio de otro tipo de grupo y ninguno del suyo aplica hoy. Revisá los precios del evento.";

/**
 * The row to store, or `null` for none. Naming no price changes none. The one
 * row that has to be told to pick one is the row that holds nothing and stores
 * nothing: there, neither the administrator nor a previous charge has said
 * anything yet.
 *
 * `allocatedAmount === 0` **preserves the previous behaviour** rather than
 * adding a rule. Until now `allocatedAmount > 0` short-circuited the crossing
 * check, so this was only ever reached with an empty row; without the added
 * test, an inscription holding money and storing no price — a state the
 * presets can produce — would start failing with "Elegí un precio".
 *
 * With no pick, a stored row of another group type would be the one the money
 * crosses on, and freeze there (#660): the row in effect, the one the dialog
 * shows, is stored instead, as a pick of it would.
 */
async function resolvePickedPriceId(
  tx: Transaction,
  input: {
    allocatedAmount: number;
    choreography: { groupType: string; scheduleId: string };
    eventId: string;
    inscription: { selectedPriceId: string | null };
    priceId: string | null;
  },
): Promise<
  { ok: false; message: string } | { ok: true; priceId: string | null }
> {
  if (input.priceId !== null) {
    return { ok: true, priceId: input.priceId };
  }

  if (
    input.inscription.selectedPriceId === null &&
    input.allocatedAmount === 0
  ) {
    return { ok: false, message: "Elegí un precio para la inscripción." };
  }

  if (!(await storesRowOfAnotherGroupType(tx, input))) {
    return { ok: true, priceId: null };
  }

  const inEffect = await readPriceInEffectId(tx, input);

  return inEffect === null
    ? { ok: false, message: storedRowOfAnotherGroupTypeMessage }
    : { ok: true, priceId: inEffect };
}

/** The row that applies today to the choreography's own price key. */
async function readPriceInEffectId(
  tx: Transaction,
  input: {
    choreography: { groupType: string; scheduleId: string };
    eventId: string;
  },
): Promise<string | null> {
  const price = selectApplicableInscriptionPrice({
    businessDate: getBusinessDateOnly(),
    key: {
      choreographyScheduleId: input.choreography.scheduleId,
      groupType: input.choreography.groupType,
      scheduleCapacityScheduleId: null,
    },
    priceRows: await loadEventPriceRows(tx, input.eventId),
  });

  return price?.id ?? null;
}

async function storesRowOfAnotherGroupType(
  tx: Transaction,
  input: {
    choreography: { groupType: string };
    inscription: { selectedPriceId: string | null };
  },
) {
  const { selectedPriceId } = input.inscription;

  if (selectedPriceId === null) {
    return false;
  }

  const [stored] = await tx
    .select({ groupType: prices.groupType })
    .from(prices)
    .where(eq(prices.id, selectedPriceId));

  return (
    stored !== undefined && stored.groupType !== input.choreography.groupType
  );
}

type InscriptionMoneyContext =
  | { ok: false; message: string }
  | {
      ok: true;
      choreography: { groupType: string; scheduleId: string };
      inscription: {
        id: string;
        selectedPriceId: string | null;
        withdrawn: boolean;
      };
    };

/**
 * Resolves the inscription against the choreography, the academy and the event
 * of the request, so a form cannot move money onto a row that belongs to
 * another screen.
 */
async function loadInscriptionMoneyContext(
  tx: Transaction,
  input: InscriptionMoneyInput,
): Promise<InscriptionMoneyContext> {
  const choreographyRow = await loadChoreographyScheduleRow(
    tx,
    input.choreographyId,
  );

  if (
    !choreographyRow ||
    choreographyRow.academyId !== input.academyId ||
    choreographyRow.eventId !== input.eventId
  ) {
    return { ok: false, message: choreographyNotFoundMessage };
  }

  // Under the row lock a withdrawal holds while it stamps the row and
  // releases its excess, so `withdrawn` cannot go stale before the money moves.
  await lockTargetRow(tx, choreographyTarget(input.inscriptionId));
  const inscription = await tx.query.choreographyDancers.findFirst({
    columns: { id: true, selectedPriceId: true, withdrawnAt: true },
    where: and(
      eq(choreographyDancers.id, input.inscriptionId),
      eq(choreographyDancers.choreographyId, input.choreographyId),
    ),
  });

  if (!inscription) {
    return { ok: false, message: "No encontramos esa inscripción." };
  }

  return {
    ok: true,
    choreography: {
      groupType: choreographyRow.groupType,
      scheduleId: resolveChoreographyPricingScheduleId(choreographyRow),
    },
    inscription: {
      id: inscription.id,
      selectedPriceId: inscription.selectedPriceId,
      withdrawn: inscription.withdrawnAt !== null,
    },
  };
}
