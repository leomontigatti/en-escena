import { eq } from "drizzle-orm";

import { categoryModalities, choreographies } from "@/db/schema";
import type {
  EventBasesExecutor,
  EventBasesTransaction,
} from "@/lib/events/bases-repository/shared.server";

/**
 * The rows a category is related to: the modalities it offers and the
 * choreographies that reference it. Kept apart from the repository so a test
 * can stand in for one of these reads without stubbing the mutations that call
 * it.
 */

export type CategoryRelationRow = {
  categoryId: string;
};

export function groupRelationIdsByCategory<
  TRelation extends CategoryRelationRow,
>(relations: TRelation[], getId: (relation: TRelation) => string) {
  const idsByCategory = new Map<string, string[]>();

  for (const relation of relations) {
    const ids = idsByCategory.get(relation.categoryId) ?? [];

    ids.push(getId(relation));
    idsByCategory.set(relation.categoryId, ids);
  }

  return idsByCategory;
}

export async function replaceCategoryRelations(
  tx: EventBasesTransaction,
  categoryId: string,
  modalityIds: readonly string[],
) {
  await tx
    .delete(categoryModalities)
    .where(eq(categoryModalities.categoryId, categoryId));

  await tx.insert(categoryModalities).values(
    modalityIds.map((modalityId) => ({
      categoryId,
      modalityId,
    })),
  );
}

/**
 * The choreographies the category edit guard refuses over: the same breadth
 * `hasReferencingChoreographies` asks about, withdrawn inscriptions included,
 * but reported by number and name rather than as a yes or no. Ordering is left
 * to `formatChoreographyReferences`, which sorts by number as part of wording
 * the refusal.
 *
 * It takes its executor because `updateCategory` asks it twice: once as a
 * pre-check and again inside the transaction that writes, where the answer has
 * to be the transaction's own.
 */
export async function listReferencingChoreographies(
  executor: EventBasesExecutor,
  categoryId: string,
) {
  return executor
    .select({
      choreographyNumber: choreographies.choreographyNumber,
      name: choreographies.name,
    })
    .from(choreographies)
    .where(eq(choreographies.categoryId, categoryId));
}
