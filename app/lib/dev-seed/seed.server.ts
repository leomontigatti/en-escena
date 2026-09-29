import { addDays } from "date-fns/addDays";
import { format } from "date-fns/format";
import { and, eq, inArray, ne } from "drizzle-orm";

import { db } from "@/db";
import {
  academies,
  categories,
  categoryModalities,
  choreographies,
  choreographyDancers,
  events,
  modalities,
  presentations,
  prices,
  scheduleCapacities,
  scheduleModalities,
  schedules,
  submodalities,
  user,
} from "@/db/schema";
import { createAccessUser } from "@/lib/auth/access-auth.test-support";
import type { InternalUserRole } from "@/lib/auth/internal-user-roles";
import { createChoreographyRegistration } from "@/lib/choreographies/registration-confirmation.server";
import { deleteSeededRows } from "@/lib/dev-seed/delete-seeded-rows.server";
import { activateEvent, createEvent } from "@/lib/events/management.server";
import { registerAcademyEventPayment } from "@/features/admin/finances/academy-choreographies/payments.server";
import { allocateToInscription } from "@/lib/finances/inscription-allocation.server";
import { disqualifyPresentation } from "@/lib/judging/disqualification.server";
import { assignJudges } from "@/lib/presentations/judge-assignments.server";
import { runAutomaticOrdering } from "@/lib/presentations/participation.server";
import { createDancerForAcademy } from "@/lib/portal/dancers.server";
import { createAcademyProfessor } from "@/lib/portal/professors.server";

// Local demo data for `pnpm db:seed`: one account per role that can sign in,
// three events and a registrable catalog on the active one, so a browser
// session has something to look at without a production dump
// (docs/local-auth.md).
//
// Re-running it resets the demo: every row hanging off the seeded accounts and
// the seeded event names is deleted first, including whatever was created on
// them through the UI since the last run.

export const DEV_SEED_ADMIN_EMAIL = "admin@enescena.local";
export const DEV_SEED_ACADEMY_EMAIL = "academia@enescena.local";
export const DEV_SEED_AUDITOR_EMAIL = "auditoria@enescena.local";
export const DEV_SEED_JUDGE_EMAIL = "jurado@enescena.local";
export const DEV_SEED_PASSWORD = "demo-en-escena";

const seededEmails = [
  DEV_SEED_ADMIN_EMAIL,
  DEV_SEED_ACADEMY_EMAIL,
  DEV_SEED_AUDITOR_EMAIL,
  DEV_SEED_JUDGE_EMAIL,
];
const seededEventNames = {
  active: "Evento Activo",
  future: "Evento Futuro",
  finished: "Evento Finalizado",
} as const;

type DevSeedResult = {
  // Events outside the seed that were active and had to give way, since only
  // one event can be active at a time.
  deactivatedEventNames: string[];
};

export async function seedDevData(input: {
  now: Date;
}): Promise<DevSeedResult> {
  await deleteSeededRows({
    emails: seededEmails,
    eventNames: Object.values(seededEventNames),
  });

  await createVerifiedUser({
    email: DEV_SEED_ADMIN_EMAIL,
    name: "Administración Demo",
    role: "admin",
  });
  // The auditor and judge panels (`/auditoria`, `/juzgamiento`) are only
  // reachable with these roles, so a browser check of their headers needs them.
  await createVerifiedUser({
    email: DEV_SEED_AUDITOR_EMAIL,
    name: "Auditoría Demo",
    role: "auditor",
  });
  const judgeUserId = await createVerifiedUser({
    email: DEV_SEED_JUDGE_EMAIL,
    name: "Jurado Demo",
    role: "judge",
  });
  const academyUserId = await createVerifiedUser({
    email: DEV_SEED_ACADEMY_EMAIL,
    name: "Academia Demo",
    role: "academy",
  });
  const [academy] = await db
    .insert(academies)
    .values({
      userId: academyUserId,
      name: "Academia Demo",
      contactName: "Carla Gómez",
      phone: "11 5555-0000",
    })
    .returning();

  const activeEvent = await createSeedEvent(
    seededEventNames.active,
    addDays(input.now, 60),
  );
  await createSeedEvent(seededEventNames.future, addDays(input.now, 365));
  await createSeedEvent(seededEventNames.finished, addDays(input.now, -60));

  const deactivated = await db
    .update(events)
    .set({ active: false })
    .where(and(eq(events.active, true), ne(events.id, activeEvent.id)))
    .returning({ name: events.name });
  expectOk(await activateEvent(activeEvent.id), "activate the active event");

  const catalog = await createCatalog(activeEvent);
  const choreographyIds = await createRosterAndChoreographies({
    academyId: academy.id,
    eventId: activeEvent.id,
    catalog,
  });
  await coverDeposits({
    academyId: academy.id,
    eventId: activeEvent.id,
    now: input.now,
    priceId: catalog.priceId,
  });
  await freezeAfternoonSchedule({
    choreographyId: choreographyIds.afternoon,
    eventId: activeEvent.id,
    judgeUserId,
    scheduledDate: catalog.scheduledDate,
  });

  return { deactivatedEventNames: deactivated.map(({ name }) => name) };
}

async function createVerifiedUser(input: {
  email: string;
  name: string;
  role: "academy" | InternalUserRole;
}) {
  // Real Better Auth sign-up, so the password hash is the one sign-in checks.
  const { user: created } = await createAccessUser({
    email: input.email,
    name: input.name,
    password: DEV_SEED_PASSWORD,
  });

  await db
    .update(user)
    .set({ emailVerified: true, role: input.role })
    .where(eq(user.id, created.id));

  return created.id;
}

async function createSeedEvent(name: string, startsAt: Date) {
  const result = await createEvent({
    name,
    startsAt,
    endsAt: addDays(startsAt, 2),
  });

  return expectOk(result, `create ${name}`).event;
}

async function createCatalog(event: { id: string; startsAt: Date }) {
  const eventId = event.id;
  const [modality] = await db
    .insert(modalities)
    .values({ eventId, name: "Jazz" })
    .returning();
  const [submodality] = await db
    .insert(submodalities)
    .values({ eventId, modalityId: modality.id, name: "Lírico" })
    .returning();
  // Readiness wants the age ladder to cover 1 to 100 with no gap.
  const seededCategories = await db
    .insert(categories)
    .values([
      {
        eventId,
        name: "Infantil",
        minAge: 1,
        maxAge: 12,
        groupTypes: ["solo"],
        groupTypeKey: "solo",
        experienceLevels: ["amateur"],
        experienceLevelKey: "amateur",
      },
      {
        eventId,
        name: "Juvenil y adultos",
        minAge: 13,
        maxAge: 100,
        groupTypes: ["solo"],
        groupTypeKey: "solo",
        experienceLevels: [],
        experienceLevelKey: "",
      },
    ])
    .returning();
  await db.insert(categoryModalities).values(
    seededCategories.map((category) => ({
      categoryId: category.id,
      modalityId: modality.id,
    })),
  );
  const scheduledDate = format(event.startsAt, "yyyy-MM-dd");
  const [morningCapacity, afternoonCapacity] = await Promise.all(
    [
      { name: "Bloque mañana", startTime: "10:00" },
      { name: "Bloque tarde", startTime: "16:00" },
    ].map((schedule) =>
      createSoloSchedule({
        eventId,
        modalityId: modality.id,
        scheduledDate,
        ...schedule,
      }),
    ),
  );
  const [price] = await db
    .insert(prices)
    .values({
      eventId,
      name: "Precio solista",
      groupType: "solo",
      amount: 25000,
      paymentDeadline: null,
    })
    .returning();

  return {
    modality,
    submodality,
    morningCapacity,
    afternoonCapacity,
    priceId: price.id,
    scheduledDate,
  };
}

async function createSoloSchedule(input: {
  eventId: string;
  modalityId: string;
  name: string;
  scheduledDate: string;
  startTime: string;
}) {
  const [schedule] = await db
    .insert(schedules)
    .values({
      eventId: input.eventId,
      name: input.name,
      scheduledDate: input.scheduledDate,
      startTime: input.startTime,
      totalCapacity: 20,
      registrationOpen: true,
    })
    .returning();
  await db
    .insert(scheduleModalities)
    .values({ scheduleId: schedule.id, modalityId: input.modalityId });
  const [scheduleCapacity] = await db
    .insert(scheduleCapacities)
    .values({ scheduleId: schedule.id, groupType: "solo", capacity: 10 })
    .returning();

  return scheduleCapacity;
}

async function createRosterAndChoreographies(input: {
  academyId: string;
  eventId: string;
  catalog: Awaited<ReturnType<typeof createCatalog>>;
}) {
  const noDocument = { documentType: "", documentNumber: "" };
  const dancerIds: string[] = [];
  for (const dancer of [
    { firstName: "Ana", lastName: "Paz", birthDate: "2012-03-14" },
    { firstName: "Bea", lastName: "Lagos", birthDate: "2010-07-02" },
  ]) {
    const result = await createDancerForAcademy(input.academyId, {
      ...dancer,
      ...noDocument,
    });
    dancerIds.push(expectOk(result, `create ${dancer.firstName}`).dancer.id);
  }

  const professorIds: string[] = [];
  for (const professor of [
    { firstName: "Luz", lastName: "Suárez" },
    { firstName: "Nora", lastName: "Díaz" },
  ]) {
    const result = await createAcademyProfessor(input.academyId, {
      ...professor,
      ...noDocument,
    });
    professorIds.push(
      expectOk(result, `create ${professor.firstName}`).professor.id,
    );
  }

  // Ana's in the morning block, Bea's in the afternoon: the afternoon one is
  // judged below, and a judged choreography freezes its whole schedule, so
  // keeping them apart leaves Ana's open to correction.
  const morning = expectOk(
    await createChoreographyRegistration({
      academyId: input.academyId,
      eventId: input.eventId,
      name: "Luna de Papel",
      modalityId: input.catalog.modality.id,
      submodalityId: input.catalog.submodality.id,
      dancerIds: [dancerIds[0]],
      professorIds: [professorIds[0]],
      experienceLevelId: null,
      scheduleCapacityId: input.catalog.morningCapacity.id,
    }),
    "register the morning choreography",
  );
  const afternoon = expectOk(
    await createChoreographyRegistration({
      academyId: input.academyId,
      eventId: input.eventId,
      name: "Viento Sur",
      modalityId: input.catalog.modality.id,
      submodalityId: input.catalog.submodality.id,
      dancerIds: [dancerIds[1]],
      professorIds: [professorIds[1]],
      experienceLevelId: null,
      scheduleCapacityId: input.catalog.afternoonCapacity.id,
    }),
    "register the afternoon choreography",
  );

  return {
    morning: morning.choreography.id,
    afternoon: afternoon.choreography.id,
  };
}

/**
 * One payment covering every inscription past its deposit (30% of 25000).
 * Crossing the deposit locks the inscription's price, the allocation locks the
 * payment's academy, and a covered deposit is what makes a choreography
 * eligible for a presentation number.
 */
async function coverDeposits(input: {
  academyId: string;
  eventId: string;
  now: Date;
  priceId: string;
}) {
  const perInscription = 10000;
  const inscriptions = await db
    .select({
      choreographyId: choreographyDancers.choreographyId,
      id: choreographyDancers.id,
    })
    .from(choreographyDancers)
    .innerJoin(
      choreographies,
      eq(choreographies.id, choreographyDancers.choreographyId),
    )
    .where(eq(choreographies.academyId, input.academyId));

  await registerAcademyEventPayment({
    academyId: input.academyId,
    amount: perInscription * inscriptions.length,
    eventId: input.eventId,
    internalNote: null,
    paymentDate: format(input.now, "yyyy-MM-dd"),
    paymentMethod: "transferencia",
    reference: null,
  });

  for (const inscription of inscriptions) {
    expectOk(
      await allocateToInscription({
        academyId: input.academyId,
        amount: perInscription,
        choreographyId: inscription.choreographyId,
        eventId: input.eventId,
        inscriptionId: inscription.id,
        priceId: input.priceId,
      }),
      "allocate a deposit",
    );
  }
}

/**
 * Numbers the event and has the demo judge disqualify the afternoon
 * choreography. A disqualification counts as evaluated, which freezes every
 * number in that schedule with no scores to invent. Judges only write on the
 * schedule's own day, so the write is dated then.
 */
async function freezeAfternoonSchedule(input: {
  choreographyId: string;
  eventId: string;
  judgeUserId: string;
  scheduledDate: string;
}) {
  expectOk(await runAutomaticOrdering(input.eventId), "order the event");
  await assignJudges({
    choreographyIds: [input.choreographyId],
    judgeIds: [input.judgeUserId],
  });
  const [presentation] = await db
    .select({ id: presentations.id })
    .from(presentations)
    .where(inArray(presentations.choreographyId, [input.choreographyId]));

  expectOk(
    await disqualifyPresentation({
      judgeId: input.judgeUserId,
      now: new Date(`${input.scheduledDate}T15:00:00Z`),
      presentationId: presentation.id,
    }),
    "disqualify the afternoon presentation",
  );
}

function expectOk<Result extends { ok: boolean }>(
  result: Result,
  step: string,
): Extract<Result, { ok: true }> {
  if (!result.ok) {
    throw new Error(`Dev seed could not ${step}: ${JSON.stringify(result)}`);
  }

  return result as Extract<Result, { ok: true }>;
}
