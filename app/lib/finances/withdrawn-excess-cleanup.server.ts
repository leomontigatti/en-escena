/**
 * The one-time cleanup that ships with #1065. Before it, a withdrawal released
 * nothing, so rows withdrawn earlier can still hold more than the deposit they
 * retain. A withdrawn row now has two outcomes only, keep the whole deposit or
 * release all of it, and the dialog offers no way to release just the excess.
 * So this pass releases it once for every withdrawn row, newest payment first,
 * through the same release the withdrawal runs: afterwards every withdrawn row
 * holds its deposit or less.
 *
 * It runs from `scripts/release-withdrawn-excess.ts` and goes with that script
 * once it has run in production.
 *
 * Each row is its own transaction, so no run holds more than one row and its
 * pool at a time, in the order a withdrawal takes them. A dry run does the same
 * work and rolls each transaction back, so it reports exactly what the real run
 * would release.
 */

import { eq, isNotNull, or } from "drizzle-orm";

import { db } from "@/db";
import {
  choreographyDancers,
  paymentAllocations,
  seminarInscriptions,
} from "@/db/schema";

import {
  lockTargetRow,
  readInscriptionAllocatedAmount,
} from "./allocation-pool.server";
import type { AllocationTargetKind } from "./allocation-target.server";
import { releaseAboveRetainedDeposit } from "./withdrawal-retention.server";

export type WithdrawnExcessRelease = {
  academyId: string;
  eventId: string;
  heldAmount: number;
  inscriptionId: string;
  kind: AllocationTargetKind;
  releasedAmount: number;
};

type WithdrawnRow = Omit<
  WithdrawnExcessRelease,
  "heldAmount" | "releasedAmount"
>;

/** Every withdrawn row it released money from, with how much. */
export async function releaseWithdrawnExcess(input: {
  apply: boolean;
}): Promise<WithdrawnExcessRelease[]> {
  const releases: WithdrawnExcessRelease[] = [];

  for (const row of await readWithdrawnRowsHoldingMoney()) {
    const release = await releaseRowExcess(row, input);

    if (release.releasedAmount > 0) {
      releases.push(release);
    }
  }

  return releases;
}

/** The thrown value that rolls a dry run's transaction back with its figure. */
class DryRunRollback extends Error {
  constructor(readonly release: WithdrawnExcessRelease) {
    super("dry run");
  }
}

async function releaseRowExcess(
  row: WithdrawnRow,
  input: { apply: boolean },
): Promise<WithdrawnExcessRelease> {
  const target = { id: row.inscriptionId, kind: row.kind };

  try {
    return await db.transaction(async (tx) => {
      await lockTargetRow(tx, target);
      const heldAmount = await readInscriptionAllocatedAmount(tx, target);
      await releaseAboveRetainedDeposit(tx, {
        academyId: row.academyId,
        eventId: row.eventId,
        target,
      });
      const release = {
        ...row,
        heldAmount,
        releasedAmount:
          heldAmount - (await readInscriptionAllocatedAmount(tx, target)),
      };

      if (!input.apply) {
        throw new DryRunRollback(release);
      }

      return release;
    });
  } catch (error) {
    if (error instanceof DryRunRollback) {
      return error.release;
    }

    throw error;
  }
}

/** The withdrawn inscriptions of either kind that still hold any money. */
async function readWithdrawnRowsHoldingMoney(): Promise<WithdrawnRow[]> {
  const rows = await db
    .selectDistinct({
      academyId: paymentAllocations.academyId,
      choreographyInscriptionId: paymentAllocations.choreographyInscriptionId,
      eventId: paymentAllocations.eventId,
      seminarInscriptionId: paymentAllocations.seminarInscriptionId,
    })
    .from(paymentAllocations)
    .leftJoin(
      choreographyDancers,
      eq(choreographyDancers.id, paymentAllocations.choreographyInscriptionId),
    )
    .leftJoin(
      seminarInscriptions,
      eq(seminarInscriptions.id, paymentAllocations.seminarInscriptionId),
    )
    .where(
      or(
        isNotNull(choreographyDancers.withdrawnAt),
        isNotNull(seminarInscriptions.withdrawnAt),
      ),
    )
    .orderBy(paymentAllocations.academyId, paymentAllocations.eventId);

  return rows.map((row) => ({
    academyId: row.academyId,
    eventId: row.eventId,
    inscriptionId:
      row.choreographyInscriptionId ?? (row.seminarInscriptionId as string),
    kind: row.choreographyInscriptionId === null ? "seminar" : "choreography",
  }));
}
