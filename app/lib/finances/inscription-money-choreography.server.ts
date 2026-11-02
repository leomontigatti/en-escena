/**
 * A choreography inscription as the money gestures see it. What differs from a
 * seminar one: the row lives in `choreography_dancer`, and its academy and event
 * are its choreography's.
 *
 * **Lock order**: the inscription row, then, on a gesture that prices, the price
 * row. `docs/domain/finances.md` fixes where the pool's lock sits after them.
 */

import { eq } from "drizzle-orm";

import { choreographies, choreographyDancers } from "@/db/schema";
import { choreographyNotFoundMessage } from "@/lib/choreographies/choreography-messages";

import { lockTargetRow } from "./allocation-pool.server";
import type { InscriptionMoneyKind } from "./inscription-money.server";
import { inscriptionMoneyRefusals } from "./inscription-money-refusals";

export const choreographyMoney: InscriptionMoneyKind = {
  async loadContext(tx, scope) {
    // Under the row lock a withdrawal holds while it stamps the row and
    // releases its excess, so `withdrawn` cannot go stale before the money moves.
    await lockTargetRow(tx, scope.target);
    const [inscription] = await tx
      .select({
        academyId: choreographies.academyId,
        eventId: choreographies.eventId,
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
        ok: false,
        message: inscriptionMoneyRefusals.inscriptionNotFound,
      };
    }

    if (
      inscription.academyId !== scope.academyId ||
      inscription.eventId !== scope.eventId
    ) {
      return { ok: false, message: choreographyNotFoundMessage };
    }

    return { ok: true, withdrawn: inscription.withdrawnAt !== null };
  },
};
