import { eq } from "drizzle-orm";

import { db } from "@/db";
import {
  academies,
  categories,
  categoryExperienceLevels,
  categoryModalities,
  dancers,
  events,
  experienceLevels,
  modalities,
  prices,
  scheduleModalities,
  schedules,
  scheduleCapacities,
  submodalities,
  user,
} from "@/db/schema";
import { createLocalAccessUser } from "@/lib/auth/access-test-auth.server";

export const OPEN_REGISTRATION_ENDS_AT = date("2099-04-30T12:00:00Z");

export async function createAcademySession({
  academyName,
  email,
}: {
  academyName: string;
  email: string;
}) {
  const signUpResult = await createLocalAccessUser({
    email,
    name: email,
    password: "password-segura",
  });

  await db
    .update(user)
    .set({
      emailVerified: true,
      role: "academy",
    })
    .where(eq(user.id, signUpResult.response.user.id));

  const [academy] = await db
    .insert(academies)
    .values({
      userId: signUpResult.response.user.id,
      name: academyName,
      contactName: "Contacto",
      phone: "11 1234-5678",
    })
    .returning();

  return {
    academyId: academy.id,
  };
}

export async function createOpenEventCatalog(
  overrides: Partial<typeof events.$inferInsert> = {},
) {
  const event = await createEventRecord({
    active: true,
    registrationEndsAt: OPEN_REGISTRATION_ENDS_AT,
    ...overrides,
  });
  const catalog = await createEventCatalog(event.id);

  return {
    event,
    catalog,
  };
}

export async function createEventRecord(
  overrides: Partial<typeof events.$inferInsert> = {},
) {
  if (overrides.active) {
    await db
      .update(events)
      .set({ active: false })
      .where(eq(events.active, true));
  }

  const [event] = await db
    .insert(events)
    .values({
      name: "Evento",
      active: false,
      programVisible: false,
      resultsVisible: false,
      requiredDepositPercentage: 30,
      registrationStartsAt: date("2026-03-01T12:00:00Z"),
      registrationEndsAt: date("2026-04-30T12:00:00Z"),
      startsAt: date("2026-05-01T12:00:00Z"),
      endsAt: date("2026-05-03T12:00:00Z"),
      ...overrides,
    })
    .returning();

  return event;
}

export async function createEventCatalog(eventId: string) {
  const [modality] = await db
    .insert(modalities)
    .values({
      eventId,
      name: `Jazz ${eventId}`,
    })
    .returning();
  const [submodality] = await db
    .insert(submodalities)
    .values({
      eventId,
      modalityId: modality.id,
      name: `Lyrical ${eventId}`,
    })
    .returning();
  const [level] = await db
    .insert(experienceLevels)
    .values({
      eventId,
      name: `Inicial ${eventId}`,
    })
    .returning();
  const [childCategory] = await db
    .insert(categories)
    .values({
      eventId,
      name: `Infantil ${eventId}`,
      minAge: 8,
      maxAge: 12,
      groupTypes: ["solo", "duo", "trio", "grupal"],
      groupTypeKey: "duo|grupal|solo|trio",
      experienceLevelKey: level.id,
    })
    .returning();
  const [teenCategory] = await db
    .insert(categories)
    .values({
      eventId,
      name: `Juvenil ${eventId}`,
      minAge: 13,
      maxAge: 17,
      groupTypes: ["solo", "duo", "trio", "grupal"],
      groupTypeKey: "duo|grupal|solo|trio",
      experienceLevelKey: "",
    })
    .returning();
  await db.insert(categoryModalities).values([
    {
      categoryId: childCategory.id,
      modalityId: modality.id,
    },
    {
      categoryId: teenCategory.id,
      modalityId: modality.id,
    },
  ]);
  await db.insert(categoryExperienceLevels).values({
    categoryId: childCategory.id,
    experienceLevelId: level.id,
  });
  const [schedule] = await db
    .insert(schedules)
    .values({
      eventId,
      name: `Bloque ${eventId}`,
      scheduledDate: "2026-05-01",
      startTime: "10:00",
      totalCapacity: 10,
    })
    .returning();
  await db.insert(scheduleModalities).values({
    scheduleId: schedule.id,
    modalityId: modality.id,
  });
  await db.insert(prices).values([
    {
      eventId,
      name: "Precio Solo",
      groupType: "solo",
      amount: 10000,
      paymentDeadline: "2026-05-31",
      scheduleId: null,
    },
    {
      eventId,
      name: "Precio Duo",
      groupType: "duo",
      amount: 15000,
      paymentDeadline: "2026-05-31",
      scheduleId: null,
    },
    {
      eventId,
      name: "Precio Trio",
      groupType: "trio",
      amount: 20000,
      paymentDeadline: "2026-05-31",
      scheduleId: null,
    },
    {
      eventId,
      name: "Precio Grupal",
      groupType: "grupal",
      amount: 25000,
      paymentDeadline: "2026-05-31",
      scheduleId: null,
    },
  ]);
  const [
    soloScheduleCapacity,
    duoScheduleCapacity,
    trioScheduleCapacity,
    grupalScheduleCapacity,
  ] = await db
    .insert(scheduleCapacities)
    .values([
      {
        scheduleId: schedule.id,
        groupType: "solo",
        capacity: 5,
      },
      {
        scheduleId: schedule.id,
        groupType: "duo",
        capacity: 5,
      },
      {
        scheduleId: schedule.id,
        groupType: "trio",
        capacity: 5,
      },
      {
        scheduleId: schedule.id,
        groupType: "grupal",
        capacity: 5,
      },
    ])
    .returning();

  return {
    modality,
    submodality,
    level,
    childCategory,
    teenCategory,
    schedule,
    soloScheduleCapacity,
    duoScheduleCapacity,
    trioScheduleCapacity,
    grupalScheduleCapacity,
  };
}

export async function createDancer(
  academyId: string,
  overrides: Partial<typeof dancers.$inferInsert> = {},
) {
  const [dancer] = await db
    .insert(dancers)
    .values({
      academyId,
      firstName: "Ana",
      lastName: "Paz",
      birthDate: "2012-01-10",
      active: true,
      ...overrides,
    })
    .returning();

  return dancer;
}

export function date(value: string) {
  return new Date(value);
}
