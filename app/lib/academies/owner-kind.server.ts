import { and, eq, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { academies } from "@/db/schema";

/**
 * An owner row is an academy or an `individual` (`Particular`): both own
 * inscriptions and money through the `academy` table (ADR-0019). Everything
 * that enumerates academies —lists, exports, `Gran final`, the
 * delete-an-empty-academy rule, academy merge, onboarding— reads academies
 * only, through this predicate. Money is the exception: an individual's is
 * administration's to operate like an academy's, so the finance list, the
 * payment picker, the comprobantes list and the collection export read both
 * kinds, and the first two say which a row is (`owner-kind.ts`). It is the
 * only place that filter lives: nobody writes `eq(academies.kind, "academy")`
 * by hand, as with `notWithdrawnChoreography()`.
 */
export function academyOwner(): SQL {
  return eq(academies.kind, "academy");
}

/**
 * The academy `academyId` names, or a 404 when there is none or the row is an
 * individual's: for a write that only an academy may take, such as loading a
 * `dancer` or a `professor` (an individual's roster is itself) or deleting an
 * empty academy.
 */
export async function requireAcademyOwner(
  academyId: string,
  executor: Pick<typeof db, "select"> = db,
) {
  const [academy] = await executor
    .select({
      id: academies.id,
      name: academies.name,
      userId: academies.userId,
    })
    .from(academies)
    .where(and(eq(academies.id, academyId), academyOwner()))
    .limit(1);

  if (!academy) {
    throw new Response("No encontramos esa academia.", { status: 404 });
  }

  return academy;
}
