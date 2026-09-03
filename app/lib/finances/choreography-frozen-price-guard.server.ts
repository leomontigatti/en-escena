import { eq } from "drizzle-orm";

import { db } from "@/db";
import { choreographyDancers, paymentAllocations } from "@/db/schema";

import type { Transaction } from "./choreography-cobro-support.server";

/**
 * Does any inscription of the choreography hold money?
 *
 * The schedule capacity is part of the price key, so moving it under an
 * inscription that already has money on it would leave that money charged
 * against a schedule the choreography no longer has.
 *
 * The test is **deliberately broader than the price lock**, which closes at the
 * deposit threshold and not at the first peso: an inscription below its deposit has
 * a price that still moves with the price list, but the money already allocated
 * to it is no less real, and this guard is about that money rather than about
 * which row prices it.
 */
export async function hasFrozenPriceInscription(
  choreographyId: string,
  executor: Transaction | typeof db = db,
) {
  const [inscription] = await executor
    .select({ id: choreographyDancers.id })
    .from(choreographyDancers)
    .innerJoin(
      paymentAllocations,
      eq(paymentAllocations.inscriptionId, choreographyDancers.id),
    )
    .where(eq(choreographyDancers.choreographyId, choreographyId))
    .limit(1);

  return inscription !== undefined;
}
