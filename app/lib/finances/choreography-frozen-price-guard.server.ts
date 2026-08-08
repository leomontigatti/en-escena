import { eq } from "drizzle-orm";

import { db } from "@/db";
import { choreographyDancers, paymentAllocations } from "@/db/schema";

import type { Transaction } from "./choreography-cobro-support.server";

/**
 * Does any inscription of the choreography have a frozen price?
 *
 * The evidence is holding payment allocations, which is exactly what freezes
 * the price: the database guard refuses to move `selected_price_id` on an
 * inscription that has money allocated to it. The schedule capacity is part of
 * the price key, so moving it while the price is frozen would leave the
 * inscription charged against a schedule the choreography no longer has.
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
