import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { choreographies, choreographyDancers } from "@/db/schema";
import { choreographyHasComprobantes } from "@/lib/comprobantes/comprobantes.server";
import { hasEvaluatedPresentation } from "@/lib/presentations/evaluation-lock.server";
import { deleteChoreographyPresentation } from "@/lib/presentations/presentation-queries.server";

import { findInscriptionsWithEvidence } from "./inscription-withdrawal.server";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type ChoreographyRemovalOutcome = "deleted" | "evaluated" | "withdrawn";

/**
 * Removing a choreography is one administrative action with two outcomes, the
 * same choice roster removal makes for a single dancer: without evidence the
 * rows go, and with evidence the choreography survives as a withdrawn one that
 * keeps its money exactly where it was allocated.
 *
 * The outcome is decided here, inside the transaction and under a `FOR UPDATE`
 * on the choreography row, and not from what the dialog was rendered with:
 * money allocated between the render and the click still leads to a withdrawal
 * instead of destroying the allocations through the cascade.
 *
 * The evaluated presentation is the only refusal left, and it refuses both
 * outcomes: `"evaluated"` is returned without writing anything. It is read
 * inside the transaction because a caller that answered it from outside the
 * `FOR UPDATE` would not be covered by the lock it took.
 */
export async function removeChoreography(
  choreographyId: string,
): Promise<ChoreographyRemovalOutcome> {
  return await db.transaction(async (tx) => {
    const [locked] = await tx
      .select({ withdrawnAt: choreographies.withdrawnAt })
      .from(choreographies)
      .where(eq(choreographies.id, choreographyId))
      .for("update");

    if (!locked) {
      throw new Error(`Cannot remove unknown choreography ${choreographyId}.`);
    }

    // A withdrawn choreography is never revisited: it stays withdrawn even once
    // every peso on it has been deallocated, so evidence is never destroyed
    // through a side door.
    if (locked.withdrawnAt) {
      return "withdrawn";
    }

    // Competitive history is never lost: a scored or disqualified presentation
    // leaves the choreography neither deletable nor withdrawable.
    if (await hasEvaluatedPresentation(choreographyId, tx)) {
      return "evaluated";
    }

    // The presentation goes with either outcome: a choreography that will not
    // be performed must not stay programmed. The number it held stays a gap —
    // every other number is what the academies were told.
    await deleteChoreographyPresentation(tx, choreographyId);

    if (!(await hasEvidenceToPreserve(tx, choreographyId))) {
      await tx
        .delete(choreographies)
        .where(eq(choreographies.id, choreographyId));

      return "deleted";
    }

    // One timestamp value for the choreography and for every inscription still
    // active, including those holding no money: it is what restoring reads to
    // revive exactly the inscriptions this withdrawal took, and not the dancers
    // removed individually beforehand — those keep their own earlier stamp.
    const withdrawnAt = new Date();

    await tx
      .update(choreographies)
      .set({ withdrawnAt })
      .where(eq(choreographies.id, choreographyId));
    await tx
      .update(choreographyDancers)
      .set({ withdrawnAt })
      .where(
        and(
          eq(choreographyDancers.choreographyId, choreographyId),
          isNull(choreographyDancers.withdrawnAt),
        ),
      );

    return "withdrawn";
  });
}

/**
 * What makes the choreography worth keeping: allocated money or a comprobante,
 * on any of its inscriptions —active or already withdrawn— or on the
 * choreography itself, which a comprobante is anchored to. A comprobante is no
 * longer a reason to refuse the removal (#340's permanent block): it is a
 * reason to withdraw.
 */
async function hasEvidenceToPreserve(
  tx: Transaction,
  choreographyId: string,
): Promise<boolean> {
  const [inscriptions, hasComprobantes] = await Promise.all([
    tx
      .select({ id: choreographyDancers.id })
      .from(choreographyDancers)
      .where(eq(choreographyDancers.choreographyId, choreographyId)),
    choreographyHasComprobantes(choreographyId, tx),
  ]);

  if (hasComprobantes) {
    return true;
  }

  const evidence = await findInscriptionsWithEvidence(
    inscriptions.map((inscription) => inscription.id),
    tx,
  );

  return evidence.size > 0;
}
