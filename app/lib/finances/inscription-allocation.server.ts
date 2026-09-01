/**
 * The write side of the money dialogs on the choreography financial detail:
 * putting an arbitrary amount on one inscription, taking an arbitrary amount
 * off it, and releasing exactly what it holds above its `Total`.
 *
 * All three go through the pool rules and **none of them lets the administrator
 * name a payment**: `spreadFromPool` consumes the academy's payments
 * oldest-first, `unwindToPool` gives them back newest-first, and which payment
 * a peso came from is the system's answer, not a person's.
 *
 * Two asymmetries between the directions are deliberate:
 *
 * - **Adding money refuses; removing money never does.** Active over-allocation
 *   is rejected by `spreadFromPool` with no override, so allocating is the only
 *   direction that can bounce. A removal has nothing to refuse: the figures and
 *   the status re-derive from whatever is left.
 * - **Only adding money has a price.** The price fixes the two thresholds, so it
 *   belongs to the moment money lands, and it is locked once the inscription
 *   covers its seña — a rule the database also holds, through the guard trigger
 *   on `selected_price_id`. The removal shapes carry no price control at all,
 *   and taking money off until the row falls back below its seña is precisely
 *   what opens the lock again.
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
import {
  calculateDepositAmount,
  deriveInscriptionFinancialFigures,
} from "@/lib/finances/inscription-financial-status";
import { readInscriptionThresholds } from "@/lib/finances/inscription-thresholds.server";
import {
  type ChoreographyGroupType,
  resolveEffectiveBasePriceRow,
} from "@/lib/finances/operational-summary-calculations.server";

import {
  readInscriptionAllocatedAmount,
  spreadFromPool,
  unwindToPool,
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

/** A price row the allocation dialog names: the stored one or the effective one. */
export type InscriptionDialogPrice = {
  amount: number;
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
 * *would* be charged when nobody has said — that is the read-side estimate in
 * `resolveEstimatedBasePriceAmount`. Here somebody is saying it: an
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
    db.query.prices.findMany({ where: eq(prices.eventId, input.eventId) }),
  ]);

  if (!event) {
    return [];
  }

  const scheduleId = resolveChoreographyPricingScheduleId(choreographyRow);

  return priceRows
    .filter(
      (price) =>
        price.groupType === choreographyRow.groupType &&
        (price.scheduleId === null || price.scheduleId === scheduleId),
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
    db.query.prices.findMany({ where: eq(prices.eventId, input.eventId) }),
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
            inscriptionId: paymentAllocations.inscriptionId,
          })
          .from(paymentAllocations)
          .where(
            inArray(
              paymentAllocations.inscriptionId,
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
        id: price.id,
        name: price.name,
      });
    }
  }

  return effectivePrices;
}

/**
 * The price row each inscription of a choreography has selected — what is
 * **stored**, which is what the picker opens on. What the inscription is charged
 * at is `readInscriptionEffectivePrices`, and below the deposit threshold the
 * two differ.
 */
export async function readInscriptionSelectedPrices(input: {
  choreographyId: string;
}): Promise<Map<string, InscriptionDialogPrice>> {
  const rows = await db
    .select({
      amount: prices.amount,
      id: prices.id,
      inscriptionId: choreographyDancers.id,
      name: prices.name,
    })
    .from(choreographyDancers)
    .innerJoin(prices, eq(choreographyDancers.selectedPriceId, prices.id))
    .where(eq(choreographyDancers.choreographyId, input.choreographyId));

  return new Map(
    rows.map((row) => [
      row.inscriptionId,
      { amount: row.amount, id: row.id, name: row.name },
    ]),
  );
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
 * while the inscription has not covered its seña: from that crossing on, a
 * different row is refused rather than warned about. Any amount is allocatable
 * — a partial one leaves the row reading `Seña pendiente` with its shortfall,
 * which is an ordinary outcome and not an error.
 */
export async function allocateToInscription(
  input: InscriptionMoneyInput & { amount: number; priceId: string | null },
): Promise<CobroResult> {
  return await runCobro(async (tx) => {
    const context = await loadInscriptionMoneyContext(tx, input);
    if (!context.ok) {
      return context;
    }

    const allocatedAmount = await readInscriptionAllocatedAmount(
      tx,
      input.inscriptionId,
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
      inscriptionId: input.inscriptionId,
    });
  });
}

/**
 * Takes an arbitrary amount off one inscription and returns it to the academy's
 * `Saldo disponible`, unwinding newest-first. Nothing here can refuse on
 * financial grounds: the resulting figures and status re-derive from what
 * remains.
 */
export async function removeFromInscription(
  input: InscriptionMoneyInput & { amount: number },
): Promise<CobroResult> {
  return await runCobro(async (tx) => {
    const context = await loadInscriptionMoneyContext(tx, input);
    if (!context.ok) {
      return context;
    }

    return await unwindInscription(tx, { ...input, amount: input.amount });
  });
}

/**
 * Releases **exactly** what the inscription holds above its `Total` and nothing
 * more. There is nothing to type and nothing to pick: the excess is computed,
 * which is what makes this one click rather than a dialog.
 */
export async function releaseInscriptionExcess(
  input: InscriptionMoneyInput,
): Promise<CobroResult> {
  return await runCobro(async (tx) => {
    const context = await loadInscriptionMoneyContext(tx, input);
    if (!context.ok) {
      return context;
    }

    const thresholds = await readInscriptionThresholds(tx, {
      academyId: input.academyId,
      eventId: input.eventId,
      inscriptionIds: [input.inscriptionId],
    });
    const inscriptionThresholds = thresholds.get(input.inscriptionId);

    if (!inscriptionThresholds) {
      return { ok: false, message: "No encontramos esa inscripción." };
    }

    const figures = deriveInscriptionFinancialFigures({
      allocatedAmount: await readInscriptionAllocatedAmount(
        tx,
        input.inscriptionId,
      ),
      thresholds: inscriptionThresholds,
    });

    if (!figures.overAllocatedAmount) {
      return {
        ok: false,
        message: "Esta inscripción no tiene excedente para liberar.",
      };
    }

    return await unwindInscription(tx, {
      ...input,
      amount: figures.overAllocatedAmount,
    });
  });
}

/**
 * The removal both gestures share: unwind through the pool rule and stop
 * there. Nothing is reconciled afterwards, because nothing is stored: the
 * figures and the status of what is left re-derive from the allocations.
 */
async function unwindInscription(
  tx: Transaction,
  input: InscriptionMoneyInput & { amount: number },
): Promise<CobroResult> {
  return await unwindToPool(tx, {
    academyId: input.academyId,
    amount: input.amount,
    eventId: input.eventId,
    inscriptionId: input.inscriptionId,
  });
}

/**
 * The price the money lands against. While the inscription is **below its
 * deposit threshold** the chosen row is written, whatever it already holds;
 * from the crossing on the price is **locked**, and a different row is refused
 * with the way out named — take enough money off to drop back below the seña.
 *
 * The threshold is the stored row's, never the incoming one's: see
 * `hasCrossedDepositThreshold`.
 */
async function applySelectedPrice(
  tx: Transaction,
  input: {
    allocatedAmount: number;
    choreography: { groupType: string; scheduleId: string | null };
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

  if (input.priceId === null) {
    // Naming no price changes none. The one row that has to be told to pick one
    // is the row that holds nothing and stores nothing: there, neither the
    // administrator nor a previous charge has said anything yet.
    //
    // `allocatedAmount === 0` **preserves the previous behaviour** rather than
    // adding a rule. Until now `allocatedAmount > 0` short-circuited above, so
    // this branch was only ever reached with an empty row; without the added
    // test, an inscription holding money and storing no price — a state the
    // presets can produce — would start failing with "Elegí un precio".
    return input.inscription.selectedPriceId === null &&
      input.allocatedAmount === 0
      ? { ok: false, message: "Elegí un precio para la inscripción." }
      : { ok: true };
  }

  const price = await loadCandidatePriceRow(tx, {
    eventId: input.eventId,
    groupType: input.choreography.groupType,
    priceId: input.priceId,
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

type InscriptionMoneyContext =
  | { ok: false; message: string }
  | {
      ok: true;
      choreography: { groupType: string; scheduleId: string | null };
      inscription: { id: string; selectedPriceId: string | null };
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

  const inscription = await tx.query.choreographyDancers.findFirst({
    columns: { id: true, selectedPriceId: true },
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
    inscription,
  };
}
