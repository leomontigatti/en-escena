/**
 * A choreography inscription as the money gestures see it. What differs from a
 * seminar one: the row lives in `choreography_dancer`, its academy and event are
 * its choreography's, its deposit is the event's rate, and its price candidates
 * are the rows of its group type and schedule.
 *
 * **Lock order**: the inscription row, then, on a gesture that prices, the price
 * row. `docs/domain/finances.md` fixes where the pool's lock sits after them.
 */

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  choreographies,
  choreographyDancers,
  events,
  prices,
} from "@/db/schema";
import { choreographyNotFoundMessage } from "@/lib/choreographies/choreography-messages";
import { resolveChoreographyPricingScheduleId } from "@/lib/finances/choreography-pricing-schedule";
import {
  calculateDepositAmount,
  hasCrossedDepositThreshold,
} from "@/lib/finances/inscription-financial-status";
import { selectApplicableInscriptionPrice } from "@/lib/finances/inscription-price";
import { loadEventPriceRows } from "@/lib/prices/rows.server";
import { getBusinessDateOnly } from "@/lib/shared/business-time-zone";

import { lockTargetRow } from "./allocation-pool.server";
import {
  loadCandidatePriceRow,
  loadChoreographyScheduleRow,
  type Executor,
  type Transaction,
} from "./choreography-cobro-support.server";
import type {
  InscriptionMoneyKind,
  InscriptionMoneyScope,
  PricingContext,
} from "./inscription-money.server";
import { inscriptionMoneyRefusals } from "./inscription-money-refusals";

type ChoreographyPricingContext = PricingContext & {
  groupType: string;
  scheduleId: string;
};

const storedRowOfAnotherGroupTypeMessage =
  "La inscripción guarda el precio de otro tipo de grupo y ninguno del suyo aplica hoy. Revisá los precios del evento.";

/**
 * The row under its lock, checked against the scope. Every read comes after the
 * lock: a draft save moving the group type holds it until it commits, so a price
 * is picked against the committed one (#660), and a withdrawal holds it while it
 * stamps the row and releases its excess, so `withdrawn` cannot go stale before
 * the money moves.
 */
async function lockInscription(tx: Transaction, scope: InscriptionMoneyScope) {
  await lockTargetRow(tx, scope.target);
  const [inscription] = await tx
    .select({
      academyId: choreographies.academyId,
      choreographyId: choreographyDancers.choreographyId,
      eventId: choreographies.eventId,
      selectedPriceId: choreographyDancers.selectedPriceId,
      withdrawnAt: choreographyDancers.withdrawnAt,
    })
    .from(choreographyDancers)
    .innerJoin(
      choreographies,
      eq(choreographies.id, choreographyDancers.choreographyId),
    )
    .where(eq(choreographyDancers.id, scope.target.id));

  if (!inscription) {
    return {
      ok: false as const,
      message: inscriptionMoneyRefusals.inscriptionNotFound,
    };
  }

  if (
    inscription.academyId !== scope.academyId ||
    inscription.eventId !== scope.eventId
  ) {
    return { ok: false as const, message: choreographyNotFoundMessage };
  }

  return { ok: true as const, inscription };
}

/** The row that applies today to the choreography's own price key. */
async function readPriceInEffectId(
  tx: Transaction,
  context: ChoreographyPricingContext,
): Promise<string | null> {
  const price = selectApplicableInscriptionPrice({
    businessDate: getBusinessDateOnly(),
    key: {
      choreographyScheduleId: context.scheduleId,
      groupType: context.groupType,
      scheduleCapacityScheduleId: null,
    },
    priceRows: await loadEventPriceRows(tx, context.eventId),
  });

  return price?.id ?? null;
}

async function storesRowOfAnotherGroupType(
  tx: Transaction,
  context: ChoreographyPricingContext,
) {
  if (context.selectedPriceId === null) {
    return false;
  }

  const [stored] = await tx
    .select({ groupType: prices.groupType })
    .from(prices)
    .where(eq(prices.id, context.selectedPriceId));

  return stored !== undefined && stored.groupType !== context.groupType;
}

export const choreographyMoney = {
  async readOwner({ eventId, inscriptionId }) {
    const [owner] = await db
      .select({
        academyId: choreographies.academyId,
        parentId: choreographyDancers.choreographyId,
      })
      .from(choreographyDancers)
      .innerJoin(
        choreographies,
        eq(choreographies.id, choreographyDancers.choreographyId),
      )
      .where(
        and(
          eq(choreographyDancers.id, inscriptionId),
          eq(choreographies.eventId, eventId),
        ),
      );

    return owner ?? null;
  },

  async loadContext(tx, scope) {
    const locked = await lockInscription(tx, scope);

    return locked.ok
      ? { ok: true, withdrawn: locked.inscription.withdrawnAt !== null }
      : locked;
  },

  async loadPricingContext(tx, scope) {
    const locked = await lockInscription(tx, scope);
    if (!locked.ok) {
      return locked;
    }

    const choreography = await loadChoreographyScheduleRow(
      tx,
      locked.inscription.choreographyId,
    );

    if (!choreography) {
      return { ok: false, message: choreographyNotFoundMessage };
    }

    return {
      eventId: scope.eventId,
      groupType: choreography.groupType,
      id: scope.target.id,
      ok: true,
      scheduleId: resolveChoreographyPricingScheduleId(choreography),
      selectedPriceId: locked.inscription.selectedPriceId,
    };
  },

  async hasCrossedStored(
    executor: Executor,
    context: { id: string },
    allocatedAmount: number,
  ) {
    const [stored] = await executor
      .select({
        priceAmount: prices.amount,
        requiredDepositPercentage: events.requiredDepositPercentage,
      })
      .from(choreographyDancers)
      .innerJoin(prices, eq(prices.id, choreographyDancers.selectedPriceId))
      .innerJoin(events, eq(events.id, prices.eventId))
      .where(eq(choreographyDancers.id, context.id));

    return (
      stored !== undefined &&
      hasCrossedDepositThreshold({
        allocatedAmount,
        depositAmount: calculateDepositAmount(stored),
      })
    );
  },

  async candidate(tx, context, priceId) {
    return await loadCandidatePriceRow(tx, {
      eventId: context.eventId,
      groupType: context.groupType,
      priceId,
      scheduleId: context.scheduleId,
    });
  },

  /**
   * With no pick, a stored row of another group type would be the one the money
   * crosses on, and freeze there (#660): the row in effect, the one the dialog
   * shows, is stored instead, as a pick of it would.
   */
  async withoutPick(tx, context) {
    if (!(await storesRowOfAnotherGroupType(tx, context))) {
      return { ok: true, priceId: null };
    }

    const inEffect = await readPriceInEffectId(tx, context);

    return inEffect === null
      ? { ok: false, message: storedRowOfAnotherGroupTypeMessage }
      : { ok: true, priceId: inEffect };
  },

  async storePrice(tx, inscriptionId, priceRowId) {
    await tx
      .update(choreographyDancers)
      .set({ selectedPriceId: priceRowId })
      .where(eq(choreographyDancers.id, inscriptionId));
  },
} satisfies InscriptionMoneyKind<ChoreographyPricingContext>;
