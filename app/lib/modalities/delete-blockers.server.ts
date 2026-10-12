import { eq } from "drizzle-orm";

import { db } from "@/db";
import {
  categoryModalities,
  choreographies,
  scheduleModalities,
  submodalities,
} from "@/db/schema";
import {
  eventBaseCopy,
  hasReferencingChoreographies,
} from "@/lib/events/bases-kernel.server";

export type ModalityDeleteBlocker =
  "submodalities" | "categories" | "schedules" | "choreographies";

export const modalityDeleteBlockerErrors = {
  submodalities: eventBaseCopy.modality.hasSubmodalitiesError,
  categories: eventBaseCopy.modality.hasCategoriesError,
  schedules: eventBaseCopy.modality.hasSchedulesError,
  choreographies: eventBaseCopy.modality.hasChoreographiesError,
} satisfies Record<ModalityDeleteBlocker, string>;

/**
 * Every relation that keeps the modality from being deleted, in the order
 * `deleteModality` reports them: one per foreign key into `modality`, none of
 * which cascades. The detail page reads it to open the blocked dialog instead
 * of a confirmation the server would refuse. Empty means the delete can run.
 */
export async function findModalityDeleteBlockers(
  modalityId: string,
): Promise<ModalityDeleteBlocker[]> {
  const [submodality, categoryRelation, scheduleRelation, hasChoreographies] =
    await Promise.all([
      db.query.submodalities.findFirst({
        columns: { id: true },
        where: eq(submodalities.modalityId, modalityId),
      }),
      db.query.categoryModalities.findFirst({
        columns: { categoryId: true },
        where: eq(categoryModalities.modalityId, modalityId),
      }),
      db.query.scheduleModalities.findFirst({
        columns: { scheduleId: true },
        where: eq(scheduleModalities.modalityId, modalityId),
      }),
      hasReferencingChoreographies(eq(choreographies.modalityId, modalityId)),
    ]);

  return [
    ...(submodality ? (["submodalities"] as const) : []),
    ...(categoryRelation ? (["categories"] as const) : []),
    ...(scheduleRelation ? (["schedules"] as const) : []),
    ...(hasChoreographies ? (["choreographies"] as const) : []),
  ];
}
