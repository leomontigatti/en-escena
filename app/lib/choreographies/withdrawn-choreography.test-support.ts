import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { choreographies, choreographyDancers } from "@/db/schema";

/**
 * The date every read test stamps its withdrawn choreography with: the day the
 * delete that motivated the withdrawal happened, kept fixed so the rows a test
 * asserts on never move under it.
 */
const testWithdrawalDate = new Date("2026-09-17T12:00:00Z");

/**
 * Stamps the choreography the way `removeChoreography` withdraws it: the
 * choreography and every inscription still active carry the one timestamp, and a
 * dancer withdrawn earlier keeps their own. The
 * read tests reach for this instead of writing the update out, so none of them
 * can leave a half-withdrawn row —stamped choreography, active roster— that the
 * write path cannot produce.
 */
export async function withdrawChoreographyForTest(
  choreographyId: string,
  withdrawnAt: Date = testWithdrawalDate,
) {
  await db.transaction(async (tx) => {
    await tx
      .update(choreographies)
      .set({ withdrawnAt, updatedAt: withdrawnAt })
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
  });
}

/**
 * The other half, for the read tests that check a restored choreography shows
 * up again: `restoreChoreography` revives the inscriptions the withdrawal took
 * along with the choreography, so a test that cleared only the choreography's
 * stamp would be asserting on a shape the write path never produces.
 */
export async function restoreChoreographyForTest(
  choreographyId: string,
  withdrawnAt: Date = testWithdrawalDate,
) {
  await db.transaction(async (tx) => {
    await tx
      .update(choreographies)
      .set({ withdrawnAt: null })
      .where(eq(choreographies.id, choreographyId));
    await tx
      .update(choreographyDancers)
      .set({ withdrawnAt: null })
      .where(
        and(
          eq(choreographyDancers.choreographyId, choreographyId),
          eq(choreographyDancers.withdrawnAt, withdrawnAt),
        ),
      );
  });
}
