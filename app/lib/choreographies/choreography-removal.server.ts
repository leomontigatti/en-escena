import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import {
  choreographies,
  choreographyDancers,
  events,
  presentations,
} from "@/db/schema";
import { resolveChoreographyLocks } from "@/lib/choreographies/choreography-locks";
import { choreographyHasComprobantes } from "@/lib/comprobantes/comprobantes.server";
import { hasEvaluatedPresentation } from "@/lib/presentations/evaluation-lock.server";
import { deleteChoreographyPresentation } from "@/lib/presentations/presentation-queries.server";

import {
  findInscriptionsWithEvidence,
  releaseAboveRetainedDeposits,
} from "./inscription-withdrawal.server";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = Transaction | typeof db;

export type ChoreographyRemovalOutcome = "deleted" | "evaluated" | "withdrawn";

/**
 * Removing a choreography is one administrative action with two outcomes, the
 * same choice roster removal makes for a single dancer: without evidence the
 * rows go, and with evidence the choreography survives as a withdrawn one whose
 * inscriptions each retain their deposit, the rest released to `Saldo
 * disponible` in the same transaction.
 *
 * The outcome is decided here, inside the transaction and under a `FOR UPDATE`
 * on the choreography row, and not from what the dialog was rendered with:
 * money allocated between the render and the click still leads to a withdrawal
 * instead of destroying the allocations through the cascade.
 *
 * The event row is locked first, the lock the automatic ordering and a manual
 * move take: a withdrawn choreography keeps its presentation, so an ordering
 * that read the event before the withdrawal committed must not then renumber
 * that presentation, or number one withdrawn before it had a number.
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
    const [owner] = await tx
      .select({ eventId: choreographies.eventId })
      .from(choreographies)
      .where(eq(choreographies.id, choreographyId));

    if (!owner) {
      throw new Error(`Cannot remove unknown choreography ${choreographyId}.`);
    }

    // `NO KEY UPDATE` and not `UPDATE`: it still waits for the ordering's
    // lock, but lets an allocation racing this removal take the `KEY SHARE`
    // its foreign key to the event needs, while this waits on its inscription.
    await tx
      .select({ id: events.id })
      .from(events)
      .where(eq(events.id, owner.eventId))
      .for("no key update");

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

    // The presentation is locked too, because a judge's score write locks it
    // and nothing else: without it a score could land between the evaluation
    // check below and the commit, leaving a withdrawn choreography evaluated.
    await tx
      .select({ id: presentations.id })
      .from(presentations)
      .where(eq(presentations.choreographyId, choreographyId))
      .for("update");

    // Competitive history is never lost: a scored or disqualified presentation
    // leaves the choreography neither deletable nor withdrawable.
    const deletion = resolveChoreographyLocks({
      actor: "admin",
      isEvaluated: await hasEvaluatedPresentation(choreographyId, tx),
      isWithdrawn: false,
    }).delete;

    if (deletion.locked) {
      return "evaluated";
    }

    // A deleted choreography takes its presentation with it, and the number it
    // held stays a gap: every other number is what the academies were told.
    if (!(await hasEvidenceToPreserve(tx, choreographyId))) {
      await deleteChoreographyPresentation(tx, choreographyId);
      await tx
        .delete(choreographies)
        .where(eq(choreographies.id, choreographyId));

      return "deleted";
    }

    // A withdrawn one keeps its presentation, judges included, at its number:
    // it stays in the order marked `Retirada`, never moved and never scored.
    //
    // One timestamp value for the choreography and for every inscription still
    // active, including those holding no money: it tells the inscriptions this
    // withdrawal took from the dancers removed individually beforehand, who keep
    // their own earlier stamp. The withdrawal is final.
    const withdrawnAt = new Date();

    await tx
      .update(choreographies)
      .set({ withdrawnAt, updatedAt: withdrawnAt })
      .where(eq(choreographies.id, choreographyId));
    const withdrawnInscriptions = await tx
      .update(choreographyDancers)
      .set({ withdrawnAt })
      .where(
        and(
          eq(choreographyDancers.choreographyId, choreographyId),
          isNull(choreographyDancers.withdrawnAt),
        ),
      )
      .returning({ id: choreographyDancers.id });

    // Each inscription this withdrawal took retains its deposit and releases the
    // rest (#1065); the ones withdrawn earlier released theirs back then.
    await releaseAboveRetainedDeposits(
      tx,
      withdrawnInscriptions.map((inscription) => inscription.id),
    );

    return "withdrawn";
  });
}

/**
 * The outcome the removal would produce right now, read without a lock and
 * without writing: it is what the dialog announces so the admin knows before
 * confirming whether the choreography goes or survives as a withdrawn one.
 *
 * It is advisory, and deliberately so. The write re-decides inside its own
 * transaction, so an announced delete can still end in a withdrawal when money
 * lands between the render and the click — never the other way round, which is
 * the direction that would destroy something.
 */
export async function previewChoreographyRemovalOutcome(
  choreographyId: string,
  executor: Executor = db,
): Promise<"deleted" | "withdrawn"> {
  return (await hasEvidenceToPreserve(executor, choreographyId))
    ? "withdrawn"
    : "deleted";
}

/**
 * What makes the choreography worth keeping: allocated money or a comprobante,
 * on any of its inscriptions —active or already withdrawn— or on the
 * choreography itself, which a comprobante is anchored to. A comprobante is no
 * longer a reason to refuse the removal (#340's permanent block): it is a
 * reason to withdraw.
 */
async function hasEvidenceToPreserve(
  tx: Executor,
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
