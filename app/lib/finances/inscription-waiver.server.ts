/**
 * The `Bonificada` waiver (ADR-0017): marking choreography inscriptions as free,
 * and taking the mark off again. One inscription or every active inscription of
 * a choreography goes through the same two functions, all or nothing.
 *
 * A waived inscription holds no money, so waiving is refused while any of them
 * carries allocations: the money has to be taken off first, which returns it to
 * the academy's `Saldo disponible`. The other half of that rule — nothing can be
 * allocated to a waived inscription — lives in the pool's own refusal.
 */

import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import { choreographyDancers } from "@/db/schema";
import { choreographyNotFoundMessage } from "@/lib/choreographies/choreography-messages";

import { choreographyTarget } from "./allocation-target.server";
import { readInscriptionAllocatedAmount } from "./allocation-pool.server";
import {
  loadChoreographyScheduleRow,
  runCobro,
  type CobroResult,
  type Transaction,
} from "./choreography-cobro-support.server";

type InscriptionWaiverInput = {
  academyId: string;
  choreographyId: string;
  eventId: string;
  inscriptionIds: string[];
};

export async function waiveInscriptions(
  input: InscriptionWaiverInput,
): Promise<CobroResult> {
  return await runCobro(async (tx) => {
    const inscriptions = await lockActiveInscriptions(tx, input);
    if (!inscriptions.ok) {
      return inscriptions;
    }

    for (const id of inscriptions.ids) {
      const allocatedAmount = await readInscriptionAllocatedAmount(
        tx,
        choreographyTarget(id),
      );

      if (allocatedAmount > 0) {
        return {
          ok: false,
          message:
            inscriptions.ids.length === 1
              ? "Para bonificar la inscripción, quitá primero su dinero."
              : "Para bonificar la coreografía, quitá primero el dinero de sus inscripciones.",
        };
      }
    }

    await tx
      .update(choreographyDancers)
      .set({ waivedAt: new Date() })
      .where(
        and(
          inArray(choreographyDancers.id, inscriptions.ids),
          isNull(choreographyDancers.waivedAt),
        ),
      );

    return { ok: true };
  });
}

/**
 * Takes the mark off: the inscription goes back to the price that applies to it
 * and reads `Seña pendiente`. A `presentation` it already holds stays — keeping
 * a number needs nothing.
 */
export async function unwaiveInscriptions(
  input: InscriptionWaiverInput,
): Promise<CobroResult> {
  return await runCobro(async (tx) => {
    const inscriptions = await lockActiveInscriptions(tx, input);
    if (!inscriptions.ok) {
      return inscriptions;
    }

    await tx
      .update(choreographyDancers)
      .set({ waivedAt: null })
      .where(inArray(choreographyDancers.id, inscriptions.ids));

    return { ok: true };
  });
}

/**
 * The requested inscriptions, resolved against the choreography, the academy
 * and the event of the request and taken **`FOR UPDATE`**, in id order. The
 * allocation path takes the same lock before it reads whether a row is waived,
 * so a waiver and an allocation racing for one row are serialized and the loser
 * reads what the winner wrote. A withdrawn inscription is off the roster and
 * cannot be waived.
 */
async function lockActiveInscriptions(
  tx: Transaction,
  input: InscriptionWaiverInput,
): Promise<{ ok: false; message: string } | { ok: true; ids: string[] }> {
  const choreography = await loadChoreographyScheduleRow(
    tx,
    input.choreographyId,
  );

  if (
    !choreography ||
    choreography.academyId !== input.academyId ||
    choreography.eventId !== input.eventId
  ) {
    return { ok: false, message: choreographyNotFoundMessage };
  }

  const requestedIds = [...new Set(input.inscriptionIds)];

  if (requestedIds.length === 0) {
    return { ok: false, message: "No encontramos esa inscripción." };
  }

  const rows = await tx
    .select({ id: choreographyDancers.id })
    .from(choreographyDancers)
    .where(
      and(
        inArray(choreographyDancers.id, requestedIds),
        eq(choreographyDancers.choreographyId, input.choreographyId),
        isNull(choreographyDancers.withdrawnAt),
      ),
    )
    .orderBy(asc(choreographyDancers.id))
    .for("update");

  if (rows.length !== requestedIds.length) {
    return { ok: false, message: "No encontramos esa inscripción." };
  }

  return { ok: true, ids: rows.map((row) => row.id) };
}
