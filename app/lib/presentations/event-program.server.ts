import { asc, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  academies,
  categories,
  choreographies,
  events,
  modalities,
  presentations,
  schedules,
  submodalities,
} from "@/db/schema";
import type { Executor } from "@/lib/finances/choreography-cobro-support.server";
import type { ChoreographyGroupType } from "@/lib/portal/choreographies";
import {
  listsDancerNames,
  readProgramDancerNames,
} from "@/lib/presentations/program-dancer-names.server";
import { getBusinessDateOnly } from "@/lib/shared/business-time-zone";

import type { ProgramListRow } from "@/features/program/shared";

/**
 * The event's program as anyone reads it, with no session at all. It is the
 * order the administration published and nothing else: every presentation, in
 * its number's order, with who dances a solo or a duo. See docs/domain/judging.md,
 * the program rules — the public page carries no money, no warning and no
 * competitive data, and a row still below its deposit is listed without any
 * mark so the numbering shows no gaps.
 */

/** A page run of the printed program: one schedule, its heading and its rows. */
export type EventProgramSchedule = {
  id: string;
  name: string;
  scheduledDate: string;
  startTime: string;
};

/** The program's row, the shared one plus the schedule the print groups by. */
export type EventProgramRow = ProgramListRow & { scheduleId: string };

export type EventProgramEvent = {
  /** Date-only, in business time: the program names days, not instants. */
  endsOn: string;
  id: string;
  name: string;
  startsOn: string;
};

export type EventProgram = {
  rows: EventProgramRow[];
  schedules: EventProgramSchedule[];
};

/**
 * The active event, but only once the organisation published its program. A
 * missing event and an unpublished program are one answer on purpose: the
 * public page never says which of the two it is.
 */
export async function findPublishedProgramEvent(
  executor: Executor = db,
): Promise<EventProgramEvent | null> {
  const [event] = await executor
    .select({
      endsAt: events.endsAt,
      id: events.id,
      name: events.name,
      programVisible: events.programVisible,
      startsAt: events.startsAt,
    })
    .from(events)
    .where(eq(events.active, true))
    .orderBy(desc(events.startsAt))
    .limit(1);

  if (!event || !event.programVisible) {
    return null;
  }

  return {
    endsOn: getBusinessDateOnly(event.endsAt),
    id: event.id,
    name: event.name,
    startsOn: getBusinessDateOnly(event.startsAt),
  };
}

/**
 * Every presentation of the event in the order it dances, and the schedules
 * those rows belong to, in the day and time order the printed program runs in.
 */
export async function readEventProgram(
  eventId: string,
  executor: Executor = db,
): Promise<EventProgram> {
  const [rows, eventSchedules] = await Promise.all([
    executor
      .select({
        academyName: academies.name,
        categoryName: categories.name,
        choreographyId: choreographies.id,
        choreographyNumber: choreographies.choreographyNumber,
        groupType: choreographies.groupType,
        modalityName: modalities.name,
        name: choreographies.name,
        orderNumber: presentations.orderNumber,
        scheduleId: schedules.id,
        scheduledDate: schedules.scheduledDate,
        submodalityName: submodalities.name,
      })
      .from(presentations)
      .innerJoin(
        choreographies,
        eq(presentations.choreographyId, choreographies.id),
      )
      .innerJoin(academies, eq(choreographies.academyId, academies.id))
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
      .where(eq(presentations.eventId, eventId))
      .orderBy(asc(presentations.orderNumber)),
    executor
      .select({
        id: schedules.id,
        name: schedules.name,
        scheduledDate: schedules.scheduledDate,
        startTime: schedules.startTime,
      })
      .from(schedules)
      .where(eq(schedules.eventId, eventId))
      .orderBy(asc(schedules.scheduledDate), asc(schedules.startTime)),
  ]);

  const dancerNamesByChoreography = await readProgramDancerNames(
    executor,
    rows
      .filter((row) => listsDancerNames(row.groupType as ChoreographyGroupType))
      .map((row) => row.choreographyId),
  );
  const presentedScheduleIds = new Set(rows.map((row) => row.scheduleId));

  return {
    rows: rows.map((row) => ({
      academyName: row.academyName,
      categoryName: row.categoryName,
      choreographyId: row.choreographyId,
      choreographyNumber: row.choreographyNumber,
      dancerNames: dancerNamesByChoreography.get(row.choreographyId) ?? [],
      groupType: row.groupType as ChoreographyGroupType,
      // The public program carries no money: a row below its deposit is listed
      // like any other, with no badge and no gap in the numbering.
      isBelowDeposit: false,
      modalityName: row.modalityName,
      name: row.name,
      orderNumber: row.orderNumber,
      scheduleId: row.scheduleId,
      scheduledDate: row.scheduledDate,
      submodalityName: row.submodalityName,
    })),
    // A schedule nobody presents in is no page of the program.
    schedules: eventSchedules.filter((schedule) =>
      presentedScheduleIds.has(schedule.id),
    ),
  };
}
