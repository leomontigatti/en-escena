import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  categories,
  choreographies,
  events,
  modalities,
  presentations,
  schedules,
  submodalities,
} from "@/db/schema";
import { notWithdrawnChoreography } from "@/lib/choreographies/withdrawn-choreography";
import type { Executor } from "@/lib/finances/choreography-cobro-support.server";
import { readEventChoreographyFinancialStatuses } from "@/lib/finances/operational-summary.server";
import { experienceLevelLabel } from "@/lib/events/experience-levels";
import type { ChoreographyGroupType } from "@/lib/portal/choreographies";
import { isPresentationEligible } from "@/lib/presentations/ordering";
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
  /** Numbered and below its deposit: it keeps the number the academy was told. */
  isBelowDeposit: boolean;
  /** The label of the level the choreography competes at, or `null`. */
  levelLabel: string | null;
  modalityName: string;
  name: string;
  /** `null` while the choreography has no presentation yet. */
  orderNumber: number | null;
  scheduledDate: string;
  submodalityName: string | null;
};

/**
 * Every choreography of the academy that is part of the order or can enter it:
 * one that has a presentation, whatever its money says, and one that is at
 * least `Señada`. A withdrawn one is never listed, numbered or not. Numbered rows come first by their number, the rest after them
 * by choreography number, which is the reading order of the list.
 */
export async function readAcademyPresentations(
  input: { academyId: string; eventId: string },
  executor: Executor = db,
): Promise<AcademyPresentationRow[]> {
  const [rows, financialStatuses] = await Promise.all([
    executor
      .select({
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
          notWithdrawnChoreography(),
        ),
      ),
    // The status is the same rollup the finance surfaces show. It is read for
    // the whole event because that is the shape the finance side offers; the
    // rows it answers for are narrowed to the academy right here.
    readEventChoreographyFinancialStatuses(input.eventId, executor),
  ]);

  const listed = rows.filter(
    (row) =>
      row.orderNumber !== null ||
      isPresentationEligible({
        financialStatus:
          financialStatuses.get(row.choreographyId) ?? "depositPending",
      }),
  );
  const dancerNamesByChoreography = await readProgramDancerNames(
    executor,
    listed
      .filter((row) => listsDancerNames(row.groupType as ChoreographyGroupType))
      .map((row) => row.choreographyId),
  );

  return listed
    .map((row) => ({
      categoryName: row.categoryName,
      choreographyId: row.choreographyId,
      choreographyNumber: row.choreographyNumber,
      dancerNames: dancerNamesByChoreography.get(row.choreographyId) ?? [],
      groupType: row.groupType as ChoreographyGroupType,
      isBelowDeposit:
        (financialStatuses.get(row.choreographyId) ?? "depositPending") ===
        "depositPending",
      levelLabel: experienceLevelLabel(row.experienceLevel),
      modalityName: row.modalityName,
      name: row.name,
      orderNumber: row.orderNumber,
      scheduledDate: row.scheduledDate,
      submodalityName: row.submodalityName,
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

/** Whether the organisation published the event's program. */
export async function isEventProgramVisible(
  eventId: string,
  executor: Executor = db,
): Promise<boolean> {
  const [event] = await executor
    .select({ programVisible: events.programVisible })
    .from(events)
    .where(eq(events.id, eventId));

  return event?.programVisible ?? false;
}

/**
 * Whether the event has been ordered at all, which is what separates "nobody
 * has a number yet" from "your academy has nothing in the program".
 */
export async function hasEventPresentations(
  eventId: string,
  executor: Executor = db,
): Promise<boolean> {
  const [presentation] = await executor
    .select({ id: presentations.id })
    .from(presentations)
    .where(eq(presentations.eventId, eventId))
    .limit(1);

  return presentation !== undefined;
}
