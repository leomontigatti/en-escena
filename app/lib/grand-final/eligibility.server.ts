import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { categories, choreographies } from "@/db/schema";
import { notWithdrawnChoreography } from "@/lib/choreographies/withdrawn-choreography";
import { grandFinalGroup, type GrandFinalGroup } from "@/lib/grand-final/group";

/** One academy eligible in one modality (`grandFinalEligibility`). */
export type GrandFinalEligiblePair = {
  academyId: string;
  modalityId: string;
};

/**
 * The academy and modality pairs of the event that meet the `Gran final`
 * requirements: at least one non-withdrawn `grupal` choreography in a
 * `children` category and one in an `adults` category, both in that modality.
 * Submodality and money are ignored. Derived on every read and never stored,
 * so registering or withdrawing a choreography changes it at once.
 */
export async function grandFinalEligibility(
  eventId: string,
  executor: Pick<typeof db, "selectDistinct"> = db,
): Promise<GrandFinalEligiblePair[]> {
  const rows = await executor
    .selectDistinct({
      academyId: choreographies.academyId,
      modalityId: choreographies.modalityId,
      categoryName: categories.name,
    })
    .from(choreographies)
    .innerJoin(categories, eq(categories.id, choreographies.categoryId))
    .where(
      and(
        eq(choreographies.eventId, eventId),
        eq(choreographies.groupType, "grupal"),
        notWithdrawnChoreography(),
      ),
    );

  const groupsByPair = new Map<
    string,
    { pair: GrandFinalEligiblePair; groups: Set<GrandFinalGroup> }
  >();

  for (const row of rows) {
    const group = grandFinalGroup(row.categoryName);

    if (!group) {
      continue;
    }

    const key = `${row.academyId}:${row.modalityId}`;
    const entry = groupsByPair.get(key) ?? {
      pair: { academyId: row.academyId, modalityId: row.modalityId },
      groups: new Set<GrandFinalGroup>(),
    };
    entry.groups.add(group);
    groupsByPair.set(key, entry);
  }

  return [...groupsByPair.values()]
    .filter(
      (entry) => entry.groups.has("children") && entry.groups.has("adults"),
    )
    .map((entry) => entry.pair)
    .sort(
      (left, right) =>
        left.academyId.localeCompare(right.academyId) ||
        left.modalityId.localeCompare(right.modalityId),
    );
}
