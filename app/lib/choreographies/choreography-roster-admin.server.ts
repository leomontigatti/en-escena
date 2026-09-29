import { and, eq, isNotNull } from "drizzle-orm";

import { db } from "@/db";
import { choreographyDancers } from "@/db/schema";
import { activeInscription } from "@/lib/choreographies/active-inscription";
import { refreshActiveInscriptionAges } from "@/lib/choreographies/inscription-age.server";
import {
  removeInscriptionsFromRoster,
  reviveWithdrawnInscriptions,
} from "@/lib/choreographies/inscription-withdrawal.server";
import type { ResolvedRegistrationDancer } from "@/lib/choreographies/registration-resolution.server";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * The inscription side of an administrative roster save. Unlike the portal's
 * wholesale replacement, the inscriptions that stay are left untouched
 * (watermark: a `señada` does not fall back to `impaga`): a dancer who left is
 * deleted without evidence and withdrawn with it
 * (`removeInscriptionsFromRoster`), a dancer who comes back revives the
 * withdrawn inscription, and the rest are inserted. Money moves in no case.
 *
 * It runs inside the caller's transaction, after the capacity guard, so a
 * rejected move leaves none of it persisted.
 */
export async function syncRosterInscriptions(input: {
  choreographyId: string;
  requestedDancerIds: Set<string>;
  resolvedDancers: ResolvedRegistrationDancer[];
  tx: Transaction;
}) {
  const { requestedDancerIds, resolvedDancers, tx } = input;

  const [currentLinks, withdrawnLinks] = await Promise.all([
    tx
      .select({
        id: choreographyDancers.id,
        dancerId: choreographyDancers.dancerId,
      })
      .from(choreographyDancers)
      .where(
        and(
          eq(choreographyDancers.choreographyId, input.choreographyId),
          activeInscription(),
        ),
      ),
    // The withdrawn ones are read on purpose: they are the candidates for
    // revival, and until they are revived they take part in nothing else.
    tx
      .select({
        id: choreographyDancers.id,
        dancerId: choreographyDancers.dancerId,
      })
      .from(choreographyDancers)
      .where(
        and(
          eq(choreographyDancers.choreographyId, input.choreographyId),
          isNotNull(choreographyDancers.withdrawnAt),
        ),
      ),
  ]);
  const currentDancerIds = new Set(currentLinks.map((row) => row.dancerId));
  const withdrawnInscriptionIdByDancerId = new Map(
    withdrawnLinks.map((row) => [row.dancerId, row.id]),
  );

  await removeInscriptionsFromRoster(
    tx,
    currentLinks
      .filter((link) => !requestedDancerIds.has(link.dancerId))
      .map((link) => link.id),
  );

  const addedDancers = resolvedDancers.filter(
    (dancer) => !currentDancerIds.has(dancer.id),
  );

  await reviveWithdrawnInscriptions(
    tx,
    addedDancers.flatMap((dancer) => {
      const inscriptionId = withdrawnInscriptionIdByDancerId.get(dancer.id);

      return inscriptionId
        ? [{ ageAtEventStart: dancer.ageAtEventStart, id: inscriptionId }]
        : [];
    }),
  );

  const insertedDancers = addedDancers.filter(
    (dancer) => !withdrawnInscriptionIdByDancerId.has(dancer.id),
  );

  if (insertedDancers.length > 0) {
    await tx.insert(choreographyDancers).values(
      insertedDancers.map((dancer) => ({
        choreographyId: input.choreographyId,
        dancerId: dancer.id,
        ageAtEventStart: dancer.ageAtEventStart,
      })),
    );
  }

  // The rows that stay are the only ones nothing above has written an age
  // onto, and the placement this same save persists was resolved from these
  // very ages: without this they would keep whatever was stored when the
  // dancer was first added, and the two would disagree.
  await refreshActiveInscriptionAges(tx, {
    choreographyId: input.choreographyId,
    ageByDancerId: new Map(
      resolvedDancers
        .filter((dancer) => currentDancerIds.has(dancer.id))
        .map((dancer) => [dancer.id, dancer.ageAtEventStart]),
    ),
  });
}
