/**
 * A seminar inscription as the money gestures see it. What differs from a
 * choreography one: the row lives in `seminar_inscription`, its event is its
 * seminar's, its academy is read **through the person**, as everywhere else on
 * this side, its deposit is the seminar's own rate and never the event's, its
 * price candidates are the seminar's kind (with its `regular` fallback) in the
 * person's participant cell, and a crossing takes a place.
 *
 * There is **no `Descuento por bailarín`** on this side, so nothing here reads
 * the rest of the academy's roster.
 *
 * **Lock order**: the seminar row, the inscription row, then, on a gesture that
 * prices, the `lockEventSeminarPrices` list lock.
 * `docs/domain/finances.md` fixes where the pool's lock sits after them.
 */

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { seminarInscriptions, seminarPrices, seminars } from "@/db/schema";
import { hasCrossedDepositThreshold } from "@/lib/finances/inscription-financial-status";
import {
  deriveSeminarInscriptionThresholds,
  selectCurrentSeminarPriceRow,
  selectSeminarPriceCandidates,
} from "@/lib/finances/seminar-inscription-price";
import {
  isParticipating,
  readSeminarParticipation,
} from "@/lib/finances/seminar-participation.server";
import { lockEventSeminarPrices } from "@/lib/seminar-prices/price-locks.server";
import { seminarInscriptionPerson } from "@/lib/seminars/inscription-person.server";
import { seminarNoPlacesForDepositMessage } from "@/lib/seminars/registration-refusals";
import {
  checkSeminarCrossings,
  readSeminarRowsCoverage,
} from "@/lib/seminars/seminar-places.server";

import { lockTargetRow } from "./allocation-pool.server";
import type { Transaction } from "./choreography-cobro-support.server";
import type {
  InscriptionMoneyKind,
  InscriptionMoneyScope,
  PricingContext,
} from "./inscription-money.server";
import { inscriptionMoneyRefusals } from "./inscription-money-refusals";
import {
  lockSeminars,
  type LockedSeminar,
} from "./seminar-money-support.server";

type SeminarPricingContext = PricingContext & {
  forParticipants: boolean;
  seminar: LockedSeminar;
};

const storedRowOfTheOtherCellMessage =
  "La inscripción guarda un precio que ya no corresponde a esta persona y ninguno de los suyos aplica hoy. Revisá los precios del evento.";

async function lockInscription(tx: Transaction, scope: InscriptionMoneyScope) {
  // The seminar's lock comes first, so the row is read once to learn which
  // seminar to lock: its parent never changes, so this read cannot go stale.
  const [parent] = await tx
    .select({ seminarId: seminarInscriptions.seminarId })
    .from(seminarInscriptions)
    .where(eq(seminarInscriptions.id, scope.target.id));

  if (!parent) {
    return {
      ok: false as const,
      message: inscriptionMoneyRefusals.inscriptionNotFound,
    };
  }

  const [seminar] = await lockSeminars(tx, [parent.seminarId]);

  if (!seminar || seminar.eventId !== scope.eventId) {
    return { ok: false as const, message: "No encontramos ese seminario." };
  }

  // Under the row lock a withdrawal holds while it stamps the row and
  // releases its excess, so `withdrawn` cannot go stale before the money moves.
  await lockTargetRow(tx, scope.target);
  const [inscription] = await tx
    .select({
      academyId: seminarInscriptionPerson.academyId,
      dancerId: seminarInscriptions.dancerId,
      individualId: seminarInscriptions.individualId,
      professorId: seminarInscriptions.professorId,
      selectedPriceId: seminarInscriptions.selectedPriceId,
      withdrawnAt: seminarInscriptions.withdrawnAt,
    })
    .from(seminarInscriptions)
    .innerJoin(
      seminarInscriptionPerson,
      eq(seminarInscriptionPerson.inscriptionId, seminarInscriptions.id),
    )
    .where(eq(seminarInscriptions.id, scope.target.id))
    .limit(1);

  if (inscription?.academyId !== scope.academyId) {
    return {
      ok: false as const,
      message: inscriptionMoneyRefusals.inscriptionNotFound,
    };
  }

  return { ok: true as const, inscription, seminar };
}

function readEventPriceRows(tx: Transaction, eventId: string) {
  return tx.query.seminarPrices.findMany({
    where: eq(seminarPrices.eventId, eventId),
  });
}

export const seminarMoney = {
  async readOwner({ eventId, inscriptionId }) {
    const [owner] = await db
      .select({
        academyId: seminarInscriptionPerson.academyId,
        parentId: seminarInscriptions.seminarId,
      })
      .from(seminarInscriptions)
      .innerJoin(seminars, eq(seminars.id, seminarInscriptions.seminarId))
      .innerJoin(
        seminarInscriptionPerson,
        eq(seminarInscriptionPerson.inscriptionId, seminarInscriptions.id),
      )
      .where(
        and(
          eq(seminarInscriptions.id, inscriptionId),
          eq(seminars.eventId, eventId),
        ),
      )
      .limit(1);

    return owner?.academyId
      ? { academyId: owner.academyId, parentId: owner.parentId }
      : null;
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

    const participation = await readSeminarParticipation(tx, {
      eventId: scope.eventId,
      rows: [locked.inscription],
    });

    // Before any price row is read: a price edit racing this write either
    // commits first and is read here, or waits and finds the row stored.
    await lockEventSeminarPrices(tx, scope.eventId);

    return {
      eventId: scope.eventId,
      forParticipants: isParticipating(locked.inscription, participation),
      id: scope.target.id,
      ok: true,
      seminar: locked.seminar,
      selectedPriceId: locked.inscription.selectedPriceId,
    };
  },

  async hasCrossedStored(executor, context, allocatedAmount) {
    const [stored] = await executor
      .select({ amount: seminarPrices.amount })
      .from(seminarInscriptions)
      .innerJoin(
        seminarPrices,
        eq(seminarPrices.id, seminarInscriptions.selectedPriceId),
      )
      .where(eq(seminarInscriptions.id, context.id));

    return (
      stored !== undefined &&
      hasCrossedDepositThreshold({
        allocatedAmount,
        depositAmount: deriveSeminarInscriptionThresholds({
          priceAmount: stored.amount,
          requiredDepositPercentage: context.seminar.requiredDepositPercentage,
        }).depositAmount,
      })
    );
  },

  async candidate(tx, context, priceId) {
    return (
      selectSeminarPriceCandidates({
        forParticipants: context.forParticipants,
        priceRows: await readEventPriceRows(tx, context.eventId),
        seminarKind: context.seminar.kind,
      }).find((price) => price.id === priceId) ?? null
    );
  },

  /**
   * With no pick, a stored row of the other participant cell would be the one
   * the money crosses on, and freeze there: the row in effect is stored
   * instead, as the seminar presets do. A stored row of the person's own cell
   * keeps its place, since somebody picked it on purpose.
   */
  async withoutPick(tx, context) {
    const priceRows = await readEventPriceRows(tx, context.eventId);
    const stored = priceRows.find((row) => row.id === context.selectedPriceId);

    if (!stored || stored.forParticipants === context.forParticipants) {
      return { ok: true, priceId: null };
    }

    const inEffect = selectCurrentSeminarPriceRow({
      forParticipants: context.forParticipants,
      priceRows,
      seminarKind: context.seminar.kind,
    });

    return inEffect === null
      ? { ok: false, message: storedRowOfTheOtherCellMessage }
      : { ok: true, priceId: inEffect.id };
  },

  async storePrice(tx, inscriptionId, priceRowId) {
    await tx
      .update(seminarInscriptions)
      .set({ selectedPriceId: priceRowId })
      .where(eq(seminarInscriptions.id, inscriptionId));
  },

  /**
   * **Covering the deposit is what takes the place**, so the quota is checked on
   * the write that crosses it and on no other: a partial allocation below the
   * deposit goes through in a full seminar, taking money off never refuses, and
   * money after the seminar started is money like any other.
   *
   * Whether the crossing fits is `checkSeminarCrossings`'s, under the lock on the
   * seminar: the places other rows hold, covered or reserved, count as taken, and
   * this row's own never does.
   *
   * The threshold after the write is the **stored** row's, read when the guard
   * runs because the pricing step may have just written it; whether the row was
   * covered before is read here, ahead of that step, so a cheaper price that the
   * money already on the row reaches counts as the crossing it is.
   */
  async crossingGuard(tx, context, now) {
    const wasCovered =
      (await readSeminarRowsCoverage(tx, [context.id])).get(context.id)
        ?.covered ?? false;

    return async (movement) => {
      const crosses =
        !wasCovered &&
        (await seminarMoney.hasCrossedStored(
          tx,
          context,
          movement.allocatedAmount + movement.amount,
        ));

      if (!crosses) {
        return { ok: true };
      }

      const check = await checkSeminarCrossings(tx, {
        crossingIdsBySeminarId: new Map([[context.seminar.id, [context.id]]]),
        now,
      });

      return check.ok
        ? { ok: true }
        : { ok: false, message: seminarNoPlacesForDepositMessage };
    };
  },
} satisfies InscriptionMoneyKind<SeminarPricingContext>;
