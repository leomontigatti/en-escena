import { db } from "@/db";
import {
  academyEventChoreographyInvoices,
  categories,
  categoryModalities,
  choreographies,
  dancers,
  events,
  modalities,
  prices,
  professors,
  scheduleCapacities,
  scheduleModalities,
  schedules,
  submodalities,
} from "@/db/schema";
import { experienceLevelLabels } from "@/lib/events/experience-levels";
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
      hasActiveFinancialLink: overrides.hasActiveFinancialLink ?? false,
      createdAt: overrides.createdAt,
      updatedAt: overrides.updatedAt,
    })
    .returning();

  return choreography;
}

export async function createDepositInvoiceRecord(input: {
  academyId: string;
  choreographyId: string;
  createdByUserId: string;
  eventId: string;
  issueDate?: string;
  invoiceNumber?: number;
  basePriceAmount?: number;
  depositAmount?: number;
  requiredDepositPercentageSnapshot?: number;
  selectedPaymentDeadline?: string | null;
}) {
  const [invoice] = await db
    .insert(academyEventChoreographyInvoices)
    .values({
      academyId: input.academyId,
      basePriceAmount: input.basePriceAmount ?? 10000,
      choreographyId: input.choreographyId,
      createdByUserId: input.createdByUserId,
      depositAmount: input.depositAmount ?? 3000,
      eventId: input.eventId,
      invoiceNumber: input.invoiceNumber ?? 1,
      invoiceType: "sena",
      issueDate: input.issueDate ?? "2026-03-20",
      requiredDepositPercentageSnapshot:
        input.requiredDepositPercentageSnapshot ?? 30,
      selectedPaymentDeadline: input.selectedPaymentDeadline ?? "2026-05-31",
    })
    .returning();

  return invoice;
}

export function date(value: string) {
  return new Date(value);
}
