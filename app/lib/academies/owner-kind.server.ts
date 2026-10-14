import { and, eq, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { academies } from "@/db/schema";

/**
 * An owner row is an academy or an `individual` (`Particular`): both own
 * inscriptions and money through the `academy` table (ADR-0019). Everything
 * that enumerates academies —lists, exports, finances, pickers, `Gran final`,
 * the delete-an-empty-academy rule, academy merge, onboarding— reads academies
 * only, through this predicate. It is the only place that filter lives: nobody
 * writes `eq(academies.kind, "academy")` by hand, as with
 * `notWithdrawnChoreography()`.
 */
export function academyOwner(): SQL {
  return eq(academies.kind, "academy");
}

/**
 * Refuses, with a 404, a write that only an academy may make: loading a
 * `dancer` or a `professor`. An individual's roster is itself, so no roster
 * person is ever created under its owner row.
 */
export async function requireAcademyOwner(academyId: string) {
  const [academy] = await db
    .select({ id: academies.id })
    .from(academies)
    .where(and(eq(academies.id, academyId), academyOwner()))
    .limit(1);

  if (!academy) {
    throw new Response("No encontramos esa Academia.", { status: 404 });
  }
}
