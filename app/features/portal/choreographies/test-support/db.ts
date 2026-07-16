import { db } from "@/db";
import {
  categories,
  categoryModalities,
  choreographies,
  choreographyDancers,
  dancers,
  events,
  modalities,
  prices,
  professors,
  scheduleCapacities,
  submodalities,
} from "@/db/schema";
import { experienceLevelLabels } from "@/lib/events/experience-levels";
import { createScheduleForModalityFixture } from "@/lib/choreographies/registration-test-fixtures.server.db";
import {
  createAcademyRecord as createPortalAcademyRecord,
  createAcademySession as createPortalAcademySession,
} from "@/features/portal/test-support/db";

const choreographyTestAcademyPhone = "11 1234-5678";

export async function createAcademySession({
  academyName,
  email,
}: {
  academyName: string;
  email: string;
}) {
  return await createPortalAcademySession({
    academyName,
    email,
    phone: choreographyTestAcademyPhone,
  });
}

export async function createAcademyRecord({
  academyName,
  email,
}: {
  academyName: string;
  email: string;
}) {
  return await createPortalAcademyRecord({
    academyName,
    email,
    phone: choreographyTestAcademyPhone,
  });
}

export async function createEventRecord(
  overrides: Partial<typeof events.$inferInsert> = {},
) {
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
  const level = { id: "amateur", name: experienceLevelLabels.amateur } as const;
  const [categoryWithLevel] = await db
    .insert(categories)
    .values({
      eventId,
      name: `Juvenil ${eventId}`,
      minAge: 13,
      maxAge: 17,
      groupTypes: ["solo"],
      groupTypeKey: "solo",
      experienceLevels: [level.id],
      experienceLevelKey: level.id,
    })
    .returning();
  const [categoryWithoutLevel] = await db
    .insert(categories)
    .values({
      eventId,
      name: `Adultos ${eventId}`,
      minAge: 18,
      maxAge: 99,
      groupTypes: ["solo"],
      groupTypeKey: "solo",
      experienceLevels: [],
      experienceLevelKey: "",
    })
    .returning();

  await db.insert(categoryModalities).values([
    {
      categoryId: categoryWithLevel.id,
      modalityId: modality.id,
    },
    {
      categoryId: categoryWithoutLevel.id,
      modalityId: modality.id,
    },
  ]);

  const schedule = await createScheduleForModalityFixture({
    eventId,
    modalityId: modality.id,
  });
  await db.insert(prices).values({
    eventId,
    name: "Precio Solo",
    groupType: "solo",
    amount: 10000,
    paymentDeadline: "2026-05-31",
    scheduleId: null,
  });

  const [scheduleCapacity] = await db
    .insert(scheduleCapacities)
    .values({
      scheduleId: schedule.id,
      groupType: "solo",
      capacity: 5,
    })
    .returning();

  return {
    categoryWithLevel,
    categoryWithoutLevel,
    level,
    modality,
    schedule,
    scheduleCapacity,
    submodality,
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

export async function createProfessor(
  academyId: string,
  overrides: Partial<typeof professors.$inferInsert> = {},
) {
  const [professor] = await db
    .insert(professors)
    .values({
      academyId,
      firstName: "Luz",
      lastName: "Suárez",
      active: true,
      ...overrides,
    })
    .returning();

  return professor;
}

export async function createChoreographyRecord(
  overrides: Partial<typeof choreographies.$inferInsert> & {
    academyId: string;
    eventId: string;
    modalityId: string;
    scheduleCapacityId: string;
    name: string;
  },
) {
  const [choreography] = await db
    .insert(choreographies)
    .values({
      academyId: overrides.academyId,
      eventId: overrides.eventId,
      name: overrides.name,
      modalityId: overrides.modalityId,
      submodalityId: overrides.submodalityId ?? null,
      groupType: overrides.groupType ?? "solo",
      categoryId: overrides.categoryId ?? null,
      categoryAgeBasis: overrides.categoryAgeBasis ?? 13,
      categoryCalculationMode: overrides.categoryCalculationMode ?? "oldest",
      experienceLevelId: overrides.experienceLevelId ?? null,
      scheduleCapacityId: overrides.scheduleCapacityId,
      musicStorageKey: overrides.musicStorageKey ?? null,
      hasPresentation: overrides.hasPresentation ?? false,
      createdAt: overrides.createdAt,
      updatedAt: overrides.updatedAt,
    })
    .returning();

  return choreography;
}

// Congela el snapshot de seña de una inscripción (choreography_dancer),
// reemplazando el viejo registro de factura de seña. Una inscripción con
// `selectedPriceId` establecido es la que hace que un precio tenga
// dependencias operativas.
export async function freezeInscriptionDepositForTest(input: {
  academyId: string;
  choreographyId: string;
  basePriceAmount?: number;
  dancerId?: string;
  depositAmount?: number;
  depositPercentage?: number;
  depositReferenceDate?: string;
  selectedPriceId?: string | null;
}) {
  const dancerId = input.dancerId ?? (await createDancer(input.academyId)).id;

  const [inscription] = await db
    .insert(choreographyDancers)
    .values({
      choreographyId: input.choreographyId,
      dancerId,
      ageAtEventStart: 14,
      frozenBasePriceAmount: input.basePriceAmount ?? 10000,
      selectedPriceId: input.selectedPriceId ?? null,
      depositReferenceDate: input.depositReferenceDate ?? "2026-03-20",
      depositPercentage: input.depositPercentage ?? 30,
      depositAmount: input.depositAmount ?? 3000,
    })
    .returning();

  return inscription;
}

export function date(value: string) {
  return new Date(value);
}
