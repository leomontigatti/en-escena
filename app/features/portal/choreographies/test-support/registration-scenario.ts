// The registration-ready event the create route's loader and action tests
// share: registration refuses anything less, so each test would otherwise
// rebuild the whole catalog.
import { expect } from "vitest";

import { db } from "@/db";
import { dancers, professors } from "@/db/schema";
import { createCategory } from "@/lib/categories/repository.server";
import {
  expectCreated,
  fixedExperienceLevel,
} from "@/lib/events/bases-test-fixtures.server.db";
import { activateEvent } from "@/lib/events/management.server";
import { createPortalSavedEvent as createSavedEvent } from "@/lib/events/saved-event-test-support.server";
import {
  createModality,
  createSubmodality,
} from "@/lib/modalities/repository.server";
import { createPrice } from "@/lib/prices/repository.server";
import {
  createSchedule,
  createScheduleCapacity,
} from "@/lib/schedules/repository.server";
import { openScheduleRegistration } from "@/lib/schedules/registration-open.server";
import { acknowledgedDuplicateIdsField } from "@/lib/shared/duplicate-warning";
import { createAcademySession } from "@/features/portal/test-support/db";

// Offset from the moment the test runs, so the event window never ages out.
function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

/**
 * An active event with everything registration needs — one modality, one
 * category, one schedule capacity with room, prices — plus a dancer and a
 * professor of the academy. Creating a choreography through the action takes
 * all of it, so the cases that differ only in what they submit share this.
 */
export async function createChoreographyRegistrationScenario(session: {
  academyName: string;
  email: string;
}) {
  const ownerSession = await createAcademySession(session);
  // Event dates anchored to the run, so the fixture never ages out.
  const event = await createSavedEvent({
    name: "Regional 2026",
    startsAt: daysFromNow(2),
    endsAt: daysFromNow(4),
  });
  await activateEvent(event.id);
  const modality = await expectCreated(
    createModality(event.id, { name: "Jazz" }),
  );
  const level = fixedExperienceLevel(event.id);
  const submodality = await expectCreated(
    createSubmodality(event.id, {
      modalityId: modality.id,
      name: "Lyrical",
    }),
  );
  const category = await expectCreated(
    createCategory(event.id, {
      name: "Juvenil",
      // The whole 1-100 range, because readiness refuses a ladder with a
      // hole and the creation this test drives goes through that gate.
      minAge: 1,
      maxAge: 100,
      groupTypes: ["solo"],
      modalityIds: [modality.id],
      experienceLevels: [level.id],
    }),
  );
  const block = await expectCreated(
    createSchedule(event.id, {
      name: "Domingo mañana",
      scheduledDate: "2026-05-03",
      startTime: "10:00",
      totalCapacity: 12,
      modalityIds: [modality.id],
    }),
  );
  const scheduleCapacity = await expectCreated(
    createScheduleCapacity(block.id, {
      groupType: "solo",
      capacity: 8,
    }),
  );
  await expectCreated(
    createPrice(event.id, {
      groupType: "solo",
      amount: 15000,
      paymentDeadline: null,
      scheduleId: null,
    }),
  );
  await expectCreated(
    createPrice(event.id, {
      groupType: "solo",
      amount: 15000,
      paymentDeadline: null,
      scheduleId: block.id,
    }),
  );
  // A `Cronograma` is born closed, and the portal only registers into an open
  // one. Opening needs the bases above in place, so it comes last.
  await expect(openScheduleRegistration(block.id)).resolves.toMatchObject({
    ok: true,
  });
  const [dancer] = await db
    .insert(dancers)
    .values({
      academyId: ownerSession.academyId,
      firstName: "Ana",
      lastName: "Paz",
      birthDate: "2014-07-01",
      active: true,
    })
    .returning();
  const [professor] = await db
    .insert(professors)
    .values({
      academyId: ownerSession.academyId,
      firstName: "Luz",
      lastName: "Suarez",
      active: true,
    })
    .returning();

  return {
    block,
    category,
    dancer,
    event,
    level,
    modality,
    ownerSession,
    professor,
    scheduleCapacity,
    submodality,
  };
}

export function choreographyCreationFormData(input: {
  acknowledgedDuplicateIds?: string[];
  eventId: string;
  name: string;
  modalityId: string;
  submodalityId: string;
  dancerIds: string[];
  professorIds: string[];
  experienceLevelId: string;
  scheduleCapacityId: string;
}) {
  const values = new FormData();

  values.set("intent", "create-choreography");
  values.set("eventId", input.eventId);
  values.set("name", input.name);
  values.set("modalityId", input.modalityId);
  values.set("submodalityId", input.submodalityId);
  values.set("experienceLevelId", input.experienceLevelId);
  values.set("scheduleCapacityId", input.scheduleCapacityId);

  for (const dancerId of input.dancerIds) {
    values.append("dancerIds", dancerId);
  }

  for (const professorId of input.professorIds) {
    values.append("professorIds", professorId);
  }

  for (const acknowledgedId of input.acknowledgedDuplicateIds ?? []) {
    values.append(acknowledgedDuplicateIdsField, acknowledgedId);
  }

  return values;
}
