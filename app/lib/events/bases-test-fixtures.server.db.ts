import { db } from "@/db";
import {
  choreographyDancers,
  choreographyProfessors,
  choreographies,
  dancers,
} from "@/db/schema";
import { createAcademyUser } from "@/lib/test-support/academies";
import { allocateChoreographyNumber } from "@/lib/choreographies/choreography-number.server";
import { readFixtureCapacityScheduleId } from "@/lib/choreographies/registration-test-fixtures.server.db";
import { activateEvent, createEvent } from "@/lib/events/management.server";
import {
  experienceLevelLabels,
  type ExperienceLevel,
} from "@/lib/events/experience-levels";
import type { GroupType } from "@/lib/events/group-types";
import { createCategory } from "@/lib/categories/repository.server";
import { createModality } from "@/lib/modalities/repository.server";
import { createPrice } from "@/lib/prices/repository.server";
import {
  createSchedule,
  createScheduleCapacity,
} from "@/lib/schedules/repository.server";

type SavedEventFixtureOptions = {
  activate?: boolean;
  dates?: SavedEventFixtureDates;
};

type SavedEventFixtureDates = {
  startsAt: Date;
  endsAt: Date;
};

type InscriptionsFixtureState = "none" | "active" | "withdrawn";

type EventChoreographyFixtureInput = {
  eventId: string;
  academyId: string;
  name: string;
  groupType?: GroupType;
  dancerIds?: string[];
  professorIds?: string[];
};

type SavedScheduleFixtureInput = {
  modalityIds: string[];
  /** Left out, the schedule accepts every category. */
  categoryIds?: string[];
  name?: string;
  scheduledDate?: string;
  startTime?: string;
  totalCapacity?: number;
};

type SavedPriceFixtureInput = {
  amount?: number;
  groupType?: GroupType;
  name?: string;
  paymentDeadline?: string | null;
  scheduleId?: string | null;
};

let createdEventOffset = 0;

export function createEventFixtureDates(year: number): SavedEventFixtureDates {
  return {
    startsAt: new Date(Date.UTC(year, 4, 1, 12, 0, 0)),
    endsAt: new Date(Date.UTC(year, 4, 3, 12, 0, 0)),
  };
}

export async function createSavedEvent(
  name: string,
  { activate = false, dates }: SavedEventFixtureOptions = {},
) {
  const eventOffset = createdEventOffset++;
  const eventDates = dates ?? createEventFixtureDates(2030 + eventOffset);
  const result = await createEvent({
    name,
    ...eventDates,
  });

  if (!result.ok) {
    throw new Error(result.error);
  }

  if (activate) {
    const activationResult = await activateEvent(result.event.id);

    if (!activationResult.ok) {
      throw new Error(activationResult.error);
    }
  }

  return result.event;
}

export async function createEventModalitiesFixture(name = "Regional 2026") {
  const event = await createSavedEvent(name);
  const jazz = await expectCreated(createModality(event.id, { name: "Jazz" }));
  const urbanas = await expectCreated(
    createModality(event.id, { name: "Danzas urbanas" }),
  );

  return { event, jazz, urbanas };
}

export async function createSavedSchedule(
  eventId: string,
  {
    categoryIds,
    modalityIds,
    name = "Sábado mañana",
    scheduledDate = "2026-05-02",
    startTime = "09:00",
    totalCapacity = 20,
  }: SavedScheduleFixtureInput,
) {
  return await expectCreated(
    createSchedule(eventId, {
      name,
      scheduledDate,
      startTime,
      totalCapacity,
      modalityIds,
      categoryIds,
    }),
  );
}

export async function createSavedPrice(
  eventId: string,
  {
    amount = 12000,
    groupType = "solo",
    name = "Precio base",
    paymentDeadline = "2026-05-31",
    scheduleId = null,
  }: SavedPriceFixtureInput = {},
) {
  return await expectCreated(
    createPrice(eventId, {
      name,
      groupType,
      amount,
      paymentDeadline,
      scheduleId,
    }),
  );
}

export async function createEventPriceFixture(name = "Regional 2026") {
  const event = await createSavedEvent(name);
  const modality = await expectCreated(
    createModality(event.id, { name: "Jazz" }),
  );
  const schedule = await createSavedSchedule(event.id, {
    modalityIds: [modality.id],
  });

  return { event, modality, schedule };
}

/**
 * The one insert both choreography fixtures share. The choreography number is
 * allocated inside the transaction that writes the row, because the allocation
 * reads the numbers already taken for the event.
 */
async function insertChoreography(
  values: Omit<
    typeof choreographies.$inferInsert,
    "choreographyNumber" | "categoryCalculationMode"
  >,
) {
  const [choreography] = await db.transaction(async (tx) =>
    tx
      .insert(choreographies)
      .values({
        ...values,
        choreographyNumber: await allocateChoreographyNumber({
          tx,
          eventId: values.eventId,
        }),
        categoryCalculationMode: "oldest",
      })
      .returning(),
  );

  return choreography;
}

export async function createEventChoreographyFixture({
  eventId,
  academyId,
  name,
  groupType = "solo",
  dancerIds = [],
  professorIds = [],
}: EventChoreographyFixtureInput) {
  const modality = await expectCreated(
    createModality(eventId, {
      name: `${name} Mod`,
    }),
  );
  const block = await expectCreated(
    createSchedule(eventId, {
      name: `${name} Bloque`,
      scheduledDate: "2026-05-01",
      startTime: "10:00",
      totalCapacity: 10,
      modalityIds: [modality.id],
    }),
  );
  const entry = await expectCreated(
    createScheduleCapacity(block.id, {
      groupType,
      capacity: 10,
    }),
  );
  const category = await createFixtureCategory({
    eventId,
    modalityId: modality.id,
    groupType,
    name: `${name} Cat`,
  });
  const choreography = await insertChoreography({
    eventId,
    academyId,
    name,
    modalityId: modality.id,
    groupType,
    categoryId: category.id,
    scheduleId: block.id,
    scheduleCapacityId: entry.id,
  });

  if (dancerIds.length > 0) {
    await db.insert(choreographyDancers).values(
      dancerIds.map((dancerId) => ({
        choreographyId: choreography.id,
        dancerId,
        ageAtEventStart: 14,
      })),
    );
  }

  if (professorIds.length > 0) {
    await db.insert(choreographyProfessors).values(
      professorIds.map((professorId) => ({
        choreographyId: choreography.id,
        professorId,
      })),
    );
  }

  return choreography;
}

type ChoreographyOnBasesFixtureInput = {
  eventId: string;
  academyId: string;
  modalityId: string;
  name?: string;
  groupType?: GroupType;
  categoryId?: string;
  experienceLevelId?: ExperienceLevel;
  scheduleId?: string;
  scheduleCapacityId?: string;
  inscriptions?: InscriptionsFixtureState;
  /** Stamps `choreographies.withdrawnAt`, so the row occupies nothing. */
  withdrawn?: boolean;
};

/**
 * The category a fixture falls back to when the caller names none: it admits
 * every age, so the row it is attached to never depends on the ages of its
 * dancers.
 */
async function createFixtureCategory(input: {
  eventId: string;
  modalityId: string;
  groupType: GroupType;
  name: string;
}) {
  return await expectCreated(
    createCategory(input.eventId, {
      name: input.name,
      minAge: 1,
      maxAge: 100,
      groupTypes: [input.groupType],
      modalityIds: [input.modalityId],
      experienceLevels: [],
    }),
  );
}

/**
 * The schedule a fixture choreography sits on. A choreography always has one,
 * so the caller that names only a capacity gets the capacity's schedule, and
 * the caller that names neither gets one invented here. That invented schedule
 * is a real row accepting the modality, so a guard test that counts the
 * schedules a modality has — the last-compatible-schedule refusals — has to
 * name its own instead of letting this one appear behind it.
 */
async function resolveFixtureScheduleId({
  eventId,
  modalityId,
  name,
  scheduleId,
  scheduleCapacityId,
}: {
  eventId: string;
  modalityId: string;
  name: string;
  scheduleId?: string;
  scheduleCapacityId?: string;
}) {
  if (scheduleId) {
    return scheduleId;
  }

  if (scheduleCapacityId) {
    return await readFixtureCapacityScheduleId(scheduleCapacityId);
  }

  return (
    await createSavedSchedule(eventId, {
      modalityIds: [modalityId],
      name: `${name} Bloque`,
    })
  ).id;
}

/**
 * A choreography sitting on the bases the caller names, with the inscription
 * state the bases guards read: none at all, one active, or one withdrawn.
 * Unlike `createEventChoreographyFixture` it invents no modality, because a
 * guard test needs the choreography on the very rows it is about to edit; it
 * does invent a schedule when the caller names none, because a choreography
 * always has one.
 */
export async function createChoreographyOnBases({
  eventId,
  academyId,
  modalityId,
  name = "Coreografía",
  groupType = "solo",
  categoryId,
  experienceLevelId,
  scheduleId,
  scheduleCapacityId,
  inscriptions = "active",
  withdrawn = false,
}: ChoreographyOnBasesFixtureInput) {
  const withdrawnAt = withdrawn ? new Date() : null;
  const choreography = await insertChoreography({
    eventId,
    academyId,
    name,
    modalityId,
    groupType,
    // A choreography always has a category, so a caller that does not name one
    // gets a category of its own: the guards under test count the categories
    // the caller built, and this one is not among them.
    categoryId:
      categoryId ??
      (
        await createFixtureCategory({
          eventId,
          modalityId,
          groupType,
          name: `${name} Cat`,
        })
      ).id,
    experienceLevelId,
    scheduleId: await resolveFixtureScheduleId({
      eventId,
      modalityId,
      name,
      scheduleId,
      scheduleCapacityId,
    }),
    scheduleCapacityId,
    withdrawnAt,
  });

  if (inscriptions !== "none") {
    const [dancer] = await db
      .insert(dancers)
      .values({
        academyId,
        firstName: "Ana",
        lastName: name,
        birthDate: "2012-01-10",
      })
      .returning();

    await db.insert(choreographyDancers).values({
      choreographyId: choreography.id,
      dancerId: dancer.id,
      ageAtEventStart: 14,
      withdrawnAt:
        withdrawnAt ?? (inscriptions === "withdrawn" ? new Date() : null),
    });
  }

  return choreography;
}

/**
 * The smallest operational dependency an event can carry: one choreography on
 * bases of its own, with the inscription state the caller names. The guard
 * suites all build these same four rows, so the recipe lives here.
 */
export async function createChoreographyOnNewBases({
  eventId,
  inscriptions,
}: {
  eventId: string;
  inscriptions?: InscriptionsFixtureState;
}) {
  const academy = await createSavedAcademy("Academia dependencias");
  const modality = await expectCreated(
    createModality(eventId, { name: "Jazz" }),
  );

  return await createChoreographyOnBases({
    eventId,
    academyId: academy.id,
    modalityId: modality.id,
    inscriptions,
  });
}

let createdAcademyOffset = 0;

export async function createSavedAcademy(name = "Academia") {
  const academyUser = await createAcademyUser({
    academyName: `${name} ${createdAcademyOffset}`,
    email: `academia.bases.${createdAcademyOffset++}@example.com`,
  });

  return academyUser.academy;
}

export async function expectCreated<TRecord extends { id: string }>(
  resultPromise: Promise<{
    ok: boolean;
    record?: TRecord;
  }>,
) {
  const result = await resultPromise;

  if (!result.ok || !result.record) {
    throw new Error("Expected `Bases del evento` creation to succeed.");
  }

  return result.record;
}

export function fixedExperienceLevel(
  eventId: string,
  id: ExperienceLevel = "amateur",
) {
  return {
    id,
    eventId,
    name: experienceLevelLabels[id],
    createdAt: new Date(0),
  };
}
