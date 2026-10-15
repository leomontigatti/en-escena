import { asc } from "drizzle-orm";

import { db } from "@/db";
import { academies } from "@/db/schema";

/**
 * Every owner row a payment can be recorded against: academies and
 * individuals (ADR-0019), whose money administration records the same way.
 * The kind travels so the picker can tell a `Particular` apart.
 */
export async function listPaymentAcademyOptions() {
  return await db.query.academies.findMany({
    columns: {
      contactName: true,
      id: true,
      kind: true,
      name: true,
    },
    orderBy: [asc(academies.name)],
  });
}
