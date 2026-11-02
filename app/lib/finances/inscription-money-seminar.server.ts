/**
 * A seminar inscription as the money gestures see it. What differs from a
 * choreography one: the row lives in `seminar_inscription`, its event is its
 * seminar's, and its academy is read **through the person**, as everywhere else
 * on this side.
 *
 * **Lock order**: the seminar row, the inscription row, then, on a gesture that
 * prices, the `lockEventSeminarPrices` list lock.
 * `docs/domain/finances.md` fixes where the pool's lock sits after them.
 */

import { eq } from "drizzle-orm";

import { seminarInscriptions } from "@/db/schema";
import { seminarInscriptionPerson } from "@/lib/seminars/inscription-person.server";

import { lockTargetRow } from "./allocation-pool.server";
import type { InscriptionMoneyKind } from "./inscription-money.server";
import { inscriptionMoneyRefusals } from "./inscription-money-refusals";
import { lockSeminars } from "./seminar-money-support.server";

export const seminarMoney: InscriptionMoneyKind = {
  async loadContext(tx, scope) {
    // The seminar's lock comes first, so the row is read once to learn which
    // seminar to lock: its parent never changes, so this read cannot go stale.
    const [parent] = await tx
      .select({ seminarId: seminarInscriptions.seminarId })
      .from(seminarInscriptions)
      .where(eq(seminarInscriptions.id, scope.target.id));

    if (!parent) {
      return {
        ok: false,
        message: inscriptionMoneyRefusals.inscriptionNotFound,
      };
    }

    const [seminar] = await lockSeminars(tx, [parent.seminarId]);

    if (!seminar || seminar.eventId !== scope.eventId) {
      return { ok: false, message: "No encontramos ese seminario." };
    }

    // Under the row lock a withdrawal holds while it stamps the row and
    // releases its excess, so `withdrawn` cannot go stale before the money moves.
    await lockTargetRow(tx, scope.target);
    const [inscription] = await tx
      .select({
        academyId: seminarInscriptionPerson.academyId,
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
        ok: false,
        message: inscriptionMoneyRefusals.inscriptionNotFound,
      };
    }

    return { ok: true, withdrawn: inscription.withdrawnAt !== null };
  },
};
