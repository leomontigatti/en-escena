// PROTOTYPE (#1652) — throwaway. The dancers a certificate would be issued to,
// per choreography: active inscriptions, roster name.
import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { choreographyDancers, dancers } from "@/db/schema";
import { activeInscription } from "@/lib/choreographies/active-inscription";

export type PrototypeCertificateDancer = { id: string; name: string };

export async function readPrototypeCertificateDancers(
  choreographyIds: string[],
): Promise<Map<string, PrototypeCertificateDancer[]>> {
  const byId = new Map<string, PrototypeCertificateDancer[]>();
  if (choreographyIds.length === 0) {
    return byId;
  }
  const rows = await db
    .select({
      choreographyId: choreographyDancers.choreographyId,
      id: dancers.id,
      firstName: dancers.firstName,
      lastName: dancers.lastName,
    })
    .from(choreographyDancers)
    .innerJoin(dancers, eq(dancers.id, choreographyDancers.dancerId))
    .where(
      and(
        inArray(choreographyDancers.choreographyId, choreographyIds),
        activeInscription(),
      ),
    )
    .orderBy(asc(dancers.lastName), asc(dancers.firstName));
  for (const row of rows) {
    const list = byId.get(row.choreographyId) ?? [];
    list.push({ id: row.id, name: `${row.firstName} ${row.lastName}` });
    byId.set(row.choreographyId, list);
  }
  return byId;
}
