import { and, asc, eq, exists, inArray, notExists, or } from "drizzle-orm";

import { db } from "@/db";
import {
  scheduleCapacities,
  scheduleCategories,
  scheduleModalities,
  schedules,
} from "@/db/schema";
import type { EventBasesExecutor } from "@/lib/events/bases-repository/shared.server";
import { type GroupType, isGroupType } from "@/lib/events/group-types";

export type CompatibleScheduleCapacityResolution =
  | {
      status: "none";
      error: string;
      options: [];
    }
  | {
      status: "auto";
      scheduleCapacity: CompatibleScheduleCapacity;
      options: [CompatibleScheduleCapacity];
    }
  | {
      status: "multiple";
      options: CompatibleScheduleCapacity[];
    };

export type CompatibleScheduleCapacity = {
  id: string;
  scheduleId: string;
  scheduleCapacityId: string | null;
  groupType: GroupType;
  capacity: number;
  createdAt: Date;
  usesGlobalCapacity: boolean;
  schedule: Pick<
    typeof schedules.$inferSelect,
    "id" | "name" | "scheduledDate" | "startTime"
  >;
};

type CompatibleScheduleRow = Pick<
  typeof schedules.$inferSelect,
  "id" | "name" | "scheduledDate" | "startTime" | "totalCapacity" | "createdAt"
>;

/**
 * The schedule compatibility rule, in SQL: a schedule takes a choreography when
 * it accepts its modality **and** its accepted categories are either empty
 * —which means every category— or contain the choreography's. Every path that
 * assigns or reassigns a schedule reaches the rule through here, so a modality
 * split into two shows resolves each side on its own. The only other statement
 * of it is `resolveScheduleOptionsFromBases` in
 * `registration-readiness.server.ts`, which answers the same question in memory
 * over already-loaded bases; the two are meant to agree, and its tests say so.
 *
 * `categoryId` is nullable because a category is not always resolved; there is
 * then nothing to filter by, and category resolution already blocks those flows
 * before a schedule matters.
 */
export async function resolveCompatibleScheduleCapacities(input: {
  eventId: string;
  modalityId: string;
  groupType: string;
  categoryId: string | null;
  // The connection to read the bases on. The birth-date correction resolves
  // schedules from inside its own transaction and has to see what that
  // transaction sees.
  executor?: EventBasesExecutor;
}): Promise<CompatibleScheduleCapacityResolution> {
  if (!isGroupType(input.groupType)) {
    return {
      status: "none",
      error: "Elegí un tipo de grupo válido.",
      options: [],
    };
  }

  const compatibleOptions = await findCompatibleScheduleCapacities({
    eventId: input.eventId,
    modalityId: input.modalityId,
    groupType: input.groupType,
    categoryId: input.categoryId,
    executor: input.executor ?? db,
  });

  if (compatibleOptions.length === 0) {
    return {
      status: "none",
      error:
        "No hay cupos de cronograma compatibles para la modalidad, la categoría y el tipo de grupo seleccionados.",
      options: [],
    };
  }

  if (compatibleOptions.length === 1) {
    return {
      status: "auto",
      scheduleCapacity: compatibleOptions[0],
      options: [compatibleOptions[0]],
    };
  }

  return {
    status: "multiple",
    options: compatibleOptions,
  };
}

/**
 * The modalities of the event that at least one schedule accepts, in one
 * query grouped by `schedule_modality.modality_id` instead of one resolution
 * pass per modality.
 *
 * It is `findCompatibleScheduleCapacities`' predicate with the modality filter
 * dropped, and it needs no group type: a schedule without a specific capacity
 * for a group type falls back to its own total capacity, so every schedule
 * that accepts the modality yields exactly one compatible option for any group
 * type. A modality missing from this list is a structural dead end — no
 * schedule of the event can take it.
 */
export async function findModalityIdsWithCompatibleSchedules(
  eventId: string,
): Promise<string[]> {
  const rows = await db
    .selectDistinct({ modalityId: scheduleModalities.modalityId })
    .from(scheduleModalities)
    .innerJoin(schedules, eq(scheduleModalities.scheduleId, schedules.id))
    .where(eq(schedules.eventId, eventId));

  return rows.map((row) => row.modalityId);
}

/**
 * The schedules of the event that at least one modality accepts, the mirror of
 * `findModalityIdsWithCompatibleSchedules` and with the same reason for needing
 * no group type: a schedule without a specific capacity for a group type falls
 * back to its own total capacity. A schedule missing from this list is a
 * structural dead end — no modality of the event can be corrected into it.
 */
export async function findScheduleIdsWithCompatibleModalities(
  eventId: string,
): Promise<string[]> {
  const rows = await db
    .selectDistinct({ scheduleId: scheduleModalities.scheduleId })
    .from(scheduleModalities)
    .innerJoin(schedules, eq(scheduleModalities.scheduleId, schedules.id))
    .where(eq(schedules.eventId, eventId));

  return rows.map((row) => row.scheduleId);
}

async function findCompatibleScheduleCapacities(input: {
  eventId: string;
  modalityId: string;
  groupType: GroupType;
  categoryId: string | null;
  executor: EventBasesExecutor;
}): Promise<CompatibleScheduleCapacity[]> {
  const compatibleSchedules = await input.executor
    .select({
      id: schedules.id,
      name: schedules.name,
      scheduledDate: schedules.scheduledDate,
      startTime: schedules.startTime,
      totalCapacity: schedules.totalCapacity,
      createdAt: schedules.createdAt,
    })
    .from(schedules)
    .innerJoin(
      scheduleModalities,
      eq(schedules.id, scheduleModalities.scheduleId),
    )
    .where(
      and(
        eq(schedules.eventId, input.eventId),
        eq(scheduleModalities.modalityId, input.modalityId),
        acceptsCategory(input.categoryId),
      ),
    )
    .orderBy(asc(schedules.scheduledDate), asc(schedules.startTime));

  if (compatibleSchedules.length === 0) {
    return [];
  }

  const specificCapacities =
    await input.executor.query.scheduleCapacities.findMany({
      where: and(
        inArray(
          scheduleCapacities.scheduleId,
          compatibleSchedules.map((schedule) => schedule.id),
        ),
        eq(scheduleCapacities.groupType, input.groupType),
      ),
    });
  const specificCapacityByScheduleId = new Map(
    specificCapacities.map((capacity) => [capacity.scheduleId, capacity]),
  );

  return compatibleSchedules.map((schedule) => {
    const specificCapacity = specificCapacityByScheduleId.get(schedule.id);

    return specificCapacity
      ? toSpecificCompatibleScheduleCapacity(schedule, specificCapacity)
      : toGlobalCompatibleScheduleCapacity(schedule, input.groupType);
  });
}

/**
 * The category half of the compatibility rule, as a predicate over
 * `schedule`: no accepted category at all, or the one asked about among them.
 */
function acceptsCategory(categoryId: string | null) {
  if (!categoryId) {
    return undefined;
  }

  return or(
    notExists(
      db
        .select({ scheduleId: scheduleCategories.scheduleId })
        .from(scheduleCategories)
        .where(eq(scheduleCategories.scheduleId, schedules.id)),
    ),
    exists(
      db
        .select({ scheduleId: scheduleCategories.scheduleId })
        .from(scheduleCategories)
        .where(
          and(
            eq(scheduleCategories.scheduleId, schedules.id),
            eq(scheduleCategories.categoryId, categoryId),
          ),
        ),
    ),
  );
}

function toSpecificCompatibleScheduleCapacity(
  schedule: CompatibleScheduleRow,
  capacity: typeof scheduleCapacities.$inferSelect,
): CompatibleScheduleCapacity {
  return {
    id: capacity.id,
    scheduleId: schedule.id,
    scheduleCapacityId: capacity.id,
    groupType: capacity.groupType,
    capacity: capacity.capacity,
    createdAt: capacity.createdAt,
    usesGlobalCapacity: false,
    schedule: {
      id: schedule.id,
      name: schedule.name,
      scheduledDate: schedule.scheduledDate,
      startTime: schedule.startTime,
    },
  };
}

function toGlobalCompatibleScheduleCapacity(
  schedule: CompatibleScheduleRow,
  groupType: GroupType,
): CompatibleScheduleCapacity {
  return {
    id: getGlobalScheduleCapacityOptionId(schedule.id),
    scheduleId: schedule.id,
    scheduleCapacityId: null,
    groupType,
    capacity: schedule.totalCapacity,
    createdAt: schedule.createdAt,
    usesGlobalCapacity: true,
    schedule: {
      id: schedule.id,
      name: schedule.name,
      scheduledDate: schedule.scheduledDate,
      startTime: schedule.startTime,
    },
  };
}

function getGlobalScheduleCapacityOptionId(scheduleId: string) {
  return `schedule:${scheduleId}:global`;
}
