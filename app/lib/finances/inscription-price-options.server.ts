/**
 * The price rows a choreography inscription's money dialog reads. The gestures
 * themselves live in `inscription-money.server.ts`.
 */

import { eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { choreographyDancers, events, paymentAllocations } from "@/db/schema";
import { resolveChoreographyPricingScheduleId } from "@/lib/finances/choreography-pricing-schedule";
import { calculateDepositAmount } from "@/lib/finances/inscription-financial-status";
import { type ChoreographyGroupType } from "@/lib/finances/operational-summary-calculations.server";
import {
  type InscriptionPriceOption,
  resolveEffectiveBasePriceRow,
} from "@/lib/finances/inscription-price";
import { loadEventPriceRows } from "@/lib/prices/rows.server";

import { restrictedChoreographyInscriptionId } from "./allocation-target.server";
import { loadChoreographyScheduleRow } from "./choreography-cobro-support.server";

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
}): Promise<Map<string, InscriptionPriceOption>> {
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

  const effectivePrices = new Map<string, InscriptionPriceOption>();
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
