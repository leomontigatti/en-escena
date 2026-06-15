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
  scheduleBlockModalities,
  scheduleBlocks,
  scheduleEntries,
  submodalities,
  user,
} from "@/db/schema";
import { auth } from "@/lib/auth/auth.server";

export const OPEN_REGISTRATION_ENDS_AT = date("2099-04-30T12:00:00Z");

export async function createAcademySession({
  academyName,
  email,
}: {
  academyName: string;
  email: string;
}) {
  const signUpResult = await auth.api.signUpEmail({
    body: {
      email,
      name: email,
      password: "password-segura",
    },
    returnHeaders: true,
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
  const [scheduleBlock] = await db
    .insert(scheduleBlocks)
    .values({
      eventId,
      name: `Bloque ${eventId}`,
      scheduledDate: "2026-05-01",
      startTime: "10:00",
      totalCapacity: 10,
    })
    .returning();
  await db.insert(scheduleBlockModalities).values({
    scheduleBlockId: scheduleBlock.id,
    modalityId: modality.id,
  });
  await db.insert(prices).values([
    {
      eventId,
      name: `Solo ${eventId}`,
      groupType: "solo",
      amount: 10000,
      scheduleBlockId: null,
    },
    {
      eventId,
      name: `Dúo ${eventId}`,
      groupType: "duo",
      amount: 15000,
      scheduleBlockId: null,
    },
    {
      eventId,
      name: `Trío ${eventId}`,
      groupType: "trio",
      amount: 20000,
      scheduleBlockId: null,
    },
    {
      eventId,
      name: `Grupal ${eventId}`,
      groupType: "grupal",
      amount: 25000,
      scheduleBlockId: null,
    },
  ]);
  const [
    soloScheduleEntry,
    duoScheduleEntry,
    trioScheduleEntry,
    grupalScheduleEntry,
  ] = await db
    .insert(scheduleEntries)
    .values([
      {
        scheduleBlockId: scheduleBlock.id,
        groupTypes: ["solo"],
        groupTypeKey: "solo",
        capacity: 5,
      },
      {
        scheduleBlockId: scheduleBlock.id,
        groupTypes: ["duo"],
        groupTypeKey: "duo",
        capacity: 5,
      },
      {
        scheduleBlockId: scheduleBlock.id,
        groupTypes: ["trio"],
        groupTypeKey: "trio",
        capacity: 5,
      },
      {
        scheduleBlockId: scheduleBlock.id,
        groupTypes: ["grupal"],
        groupTypeKey: "grupal",
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
    scheduleBlock,
    soloScheduleEntry,
    duoScheduleEntry,
    trioScheduleEntry,
    grupalScheduleEntry,
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
