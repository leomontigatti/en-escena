import { db } from "@/db";
import {
  choreographyDancers,
  choreographyProfessors,
  choreographies,
} from "@/db/schema";
import { activateEvent, createEvent } from "@/lib/events/management.server";
import {
  experienceLevelLabels,
  type ExperienceLevel,
} from "@/lib/events/experience-levels";
import type { GroupType } from "@/lib/events/group-types";
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
  registrationStartsAt: Date;
  registrationEndsAt: Date;
  startsAt: Date;
  endsAt: Date;
};

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
  name?: string;
  scheduledDate?: string;
  startTime?: string;
  totalCapacity?: number;
};

type SavedPriceFixtureInput = {
  amount?: number;
  groupType?: GroupType;
  name?: string;
  paymentDeadline?: string;
  scheduleId?: string | null;
};

let createdEventOffset = 0;

export function createEventFixtureDates(year: number): SavedEventFixtureDates {
  return {
    registrationStartsAt: new Date(Date.UTC(year, 2, 1, 12, 0, 0)),
    registrationEndsAt: new Date(Date.UTC(year, 3, 30, 12, 0, 0)),
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
  const [choreography] = await db
    .insert(choreographies)
    .values({
      eventId,
      academyId,
      name,
      modalityId: modality.id,
      groupType,
      categoryCalculationMode: "oldest",
      scheduleCapacityId: entry.id,
    })
    .returning();

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

export async function expectCreated<TRecord extends { id: string }>(
  resultPromise: Promise<{
    ok: boolean;
    record?: TRecord;
  }>,
) {
  const result = await resultPromise;

  if (!result.ok || !result.record) {
    throw new Error("Expected Bases del evento creation to succeed.");
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
