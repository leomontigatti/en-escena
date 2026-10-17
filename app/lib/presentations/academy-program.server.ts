import { and, eq, inArray, isNotNull, or } from "drizzle-orm";

import { db } from "@/db";
import {
  categories,
  choreographies,
  modalities,
  presentations,
  schedules,
  submodalities,
} from "@/db/schema";
import { notWithdrawnChoreography } from "@/lib/choreographies/withdrawn-choreography";
import type { Executor } from "@/lib/finances/choreography-cobro-support.server";
import { readEventChoreographyFinancialStatuses } from "@/lib/finances/operational-summary.server";
import {
  experienceLevelDisplayLabel,
  experienceLevelRequirement,
} from "@/lib/choreographies/experience-level-requirement";
import type { ChoreographyGroupType } from "@/lib/portal/choreographies";
import {
  listsDancerNames,
  readProgramDancerNames,
} from "@/lib/presentations/program-dancer-names.server";

/**
 * What one academy is told about the order: the rows of its own choreographies,
 * with the number each presents with and the day it dances. It is a read of its
 * own and not a narrowing of the participation list — the academy is never
 * shown the spacing and block warnings the administrator works from, and it
 * never sees another academy's rows. See docs/domain/judging.md, "Participation
 * And Judging".
 */

export type AcademyPresentationRow = {
  categoryName: string;
  choreographyId: string;
  choreographyNumber: number;
  /** Named for a solo and a duo only; a group's list would outgrow the row. */
  dancerNames: string[];
  groupType: ChoreographyGroupType;
  /** Below its deposit, numbered or not: a notice on the row, never a bar. */
  isBelowDeposit: boolean;
  /**
   * The label of the level the choreography competes at, or the empty level
   * worded by why it is empty (`Sin asignar`, `Sin nivel`, `No aplica`).
   */
  levelLabel: string;
  modalityName: string;
  name: string;
  /**
   * `null` while the choreography has no presentation yet, and while its day's
   * program is not published: a number that may still change never leaves
   * the server.
   */
  orderNumber: number | null;
  scheduledDate: string;
  submodalityName: string | null;
  /** `Coreografía retirada`, kept only while it shows its number. */
  withdrawn: boolean;
};

/**
 * Every choreography of the academy, numbered or not, whatever its money says.
 * A withdrawn one is kept only while it shows a number, which it keeps
 * marked `withdrawn`: one never numbered, or whose day is not published, has
 * nothing left to tell the academy and is left out. Numbered rows come first by their number,
 * the rest after them by choreography number, which is the reading order of
 * the list.
 *
 * A row whose day is not among `visibleDays` loses its number before the sort,
 * so it reads like one not placed yet: neither the number nor where it falls
 * among the academy's others tells the academy an order still open to change.
 */
export async function readAcademyPresentations(
  input: {
    academyId: string;
    eventId: string;
    /** The days whose program is published; see `readVisibleProgramDays`. */
    visibleDays: readonly string[];
  },
  executor: Executor = db,
): Promise<AcademyPresentationRow[]> {
  const [rows, financialStatuses] = await Promise.all([
    executor
      .select({
        categoryExperienceLevels: categories.experienceLevels,
        categoryName: categories.name,
        choreographyId: choreographies.id,
        choreographyNumber: choreographies.choreographyNumber,
        experienceLevel: choreographies.experienceLevelId,
        groupType: choreographies.groupType,
        modalityName: modalities.name,
        name: choreographies.name,
        orderNumber: presentations.orderNumber,
        scheduledDate: schedules.scheduledDate,
        submodalityName: submodalities.name,
        withdrawnAt: choreographies.withdrawnAt,
      })
      .from(choreographies)
      .innerJoin(modalities, eq(choreographies.modalityId, modalities.id))
      .leftJoin(
        submodalities,
        eq(choreographies.submodalityId, submodalities.id),
      )
      // Both joins are inner and read the choreography's own column: it always
      // has a category and a schedule, and the schedule is never reached
      // through `scheduleCapacityId`, which stays nullable.
      .innerJoin(categories, eq(choreographies.categoryId, categories.id))
      .innerJoin(schedules, eq(choreographies.scheduleId, schedules.id))
      .leftJoin(
        presentations,
        eq(presentations.choreographyId, choreographies.id),
      )
      .where(
        and(
          eq(choreographies.eventId, input.eventId),
          eq(choreographies.academyId, input.academyId),
          or(notWithdrawnChoreography(), isNotNull(presentations.id)),
        ),
      ),
    // The status is the same rollup the finance surfaces show. It is read for
    // the whole event because that is the shape the finance side offers; the
    // rows it answers for are narrowed to the academy right here.
    readEventChoreographyFinancialStatuses(input.eventId, executor),
  ]);

  const dancerNamesByChoreography = await readProgramDancerNames(
    executor,
    rows
      .filter((row) => listsDancerNames(row.groupType as ChoreographyGroupType))
      .map((row) => row.choreographyId),
  );

  const visibleDays = new Set(input.visibleDays);

  return rows
    .filter(
      (row) => row.withdrawnAt === null || visibleDays.has(row.scheduledDate),
    )
    .map((row) => ({
      categoryName: row.categoryName,
      choreographyId: row.choreographyId,
      choreographyNumber: row.choreographyNumber,
      dancerNames: dancerNamesByChoreography.get(row.choreographyId) ?? [],
      groupType: row.groupType as ChoreographyGroupType,
      // A withdrawn one reads `Retirada`, never a deposit to cover.
      isBelowDeposit:
        row.withdrawnAt === null &&
        (financialStatuses.get(row.choreographyId) ?? "depositPending") ===
          "depositPending",
      levelLabel: experienceLevelDisplayLabel(
        row.experienceLevel,
        experienceLevelRequirement({
          categoryExperienceLevels: row.categoryExperienceLevels,
          groupType: row.groupType as ChoreographyGroupType,
        }),
      ),
      modalityName: row.modalityName,
      name: row.name,
      orderNumber: visibleDays.has(row.scheduledDate) ? row.orderNumber : null,
      scheduledDate: row.scheduledDate,
      submodalityName: row.submodalityName,
      withdrawn: row.withdrawnAt !== null,
    }))
    .sort(compareAcademyPresentationRows);
}

function compareAcademyPresentationRows(
  left: AcademyPresentationRow,
  right: AcademyPresentationRow,
) {
  if (left.orderNumber !== null && right.orderNumber !== null) {
    return left.orderNumber - right.orderNumber;
  }

  if (left.orderNumber !== right.orderNumber) {
    return left.orderNumber === null ? 1 : -1;
  }

  return left.choreographyNumber - right.choreographyNumber;
}

/**
 * Whether a published day of the event has a presentation, a withdrawn one
 * included since it keeps its number in the program, which is what
 * separates "no number has been published yet" from "your academy has nothing
 * in the program". An event ordered with no day published reads as the first:
 * the academy is told nothing about an order still open to change.
 */
export async function hasPublishedPresentations(
  input: { eventId: string; visibleDays: readonly string[] },
  executor: Executor = db,
): Promise<boolean> {
  if (input.visibleDays.length === 0) {
    return false;
  }

  const [presentation] = await executor
    .select({ id: presentations.id })
    .from(presentations)
    .innerJoin(
      choreographies,
      eq(presentations.choreographyId, choreographies.id),
    )
    .innerJoin(schedules, eq(choreographies.scheduleId, schedules.id))
    .where(
      and(
        eq(presentations.eventId, input.eventId),
        inArray(schedules.scheduledDate, [...input.visibleDays]),
      ),
    )
    .limit(1);

  return presentation !== undefined;
}
