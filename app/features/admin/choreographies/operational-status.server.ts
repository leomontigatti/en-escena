import { inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  categories,
  choreographies,
  choreographyProfessors,
} from "@/db/schema";
import { deriveChoreographyOperationalStatus } from "@/lib/choreographies/operational-status";

/**
 * What the admin reads a choreography's operational status off, as a select
 * over `choreographies` joined to its category, which the operational list
 * spreads into its own select to label each row.
 */
export const operationalStatusColumns = {
  categoryAgeBasis: choreographies.categoryAgeBasis,
  categoryExperienceLevels: categories.experienceLevels,
  categoryMaxAge: categories.maxAge,
  categoryMinAge: categories.minAge,
  experienceLevelId: choreographies.experienceLevelId,
  musicStorageKey: choreographies.musicStorageKey,
};

type OperationalStatusRow = {
  categoryAgeBasis: number | null;
  categoryExperienceLevels: string[];
  categoryMaxAge: number;
  categoryMinAge: number;
  experienceLevelId: string | null;
  id: string;
  musicStorageKey: string | null;
};

/**
 * The admin's status for each row, with the placement re-checked against the
 * category as it stands today. The professors are read in one query for all of
 * them, which is the only part the select above cannot carry.
 */
export async function deriveAdminOperationalStatuses<
  Row extends OperationalStatusRow,
>(rows: Row[]) {
  const choreographyIdsWithProfessors = await listChoreographyIdsWithProfessors(
    rows.map((row) => row.id),
  );

  return rows.map((row) => ({
    row,
    operationalStatus: deriveChoreographyOperationalStatus({
      categoryExperienceLevels: row.categoryExperienceLevels,
      experienceLevelId: row.experienceLevelId,
      hasMusic: row.musicStorageKey !== null,
      hasProfessors: choreographyIdsWithProfessors.has(row.id),
      placementCheck: {
        categoryAgeBasis: row.categoryAgeBasis,
        categoryMaxAge: row.categoryMaxAge,
        categoryMinAge: row.categoryMinAge,
      },
    }),
  }));
}

async function listChoreographyIdsWithProfessors(choreographyIds: string[]) {
  if (choreographyIds.length === 0) {
    return new Set<string>();
  }

  const professorRows = await db
    .selectDistinct({ choreographyId: choreographyProfessors.choreographyId })
    .from(choreographyProfessors)
    .where(inArray(choreographyProfessors.choreographyId, choreographyIds));

  return new Set(professorRows.map((row) => row.choreographyId));
}
