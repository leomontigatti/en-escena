import { addDays } from "date-fns/addDays";
import { format } from "date-fns/format";
import { and, eq, ne } from "drizzle-orm";

import { db } from "@/db";
import {
  academies,
  categories,
  categoryModalities,
  events,
  modalities,
  prices,
  scheduleCapacities,
  scheduleModalities,
  schedules,
  submodalities,
  user,
} from "@/db/schema";
import { createAccessUser } from "@/lib/auth/access-auth.test-support";
import { createChoreographyRegistration } from "@/lib/choreographies/registration-confirmation.server";
import { deleteSeededRows } from "@/lib/dev-seed/delete-seeded-rows.server";
import { activateEvent, createEvent } from "@/lib/events/management.server";
import { createDancerForAcademy } from "@/lib/portal/dancers.server";
import { createAcademyProfessor } from "@/lib/portal/professors.server";

// Local demo data for `pnpm db:seed`: two accounts that can sign in, three
// events and a registrable catalog on the active one, so a browser session has
// something to look at without a production dump (docs/local-auth.md).
//
// Re-running it resets the demo: every row hanging off the seeded accounts and
// the seeded event names is deleted first, including whatever was created on
// them through the UI since the last run.

export const DEV_SEED_ADMIN_EMAIL = "admin@enescena.local";
export const DEV_SEED_ACADEMY_EMAIL = "academia@enescena.local";
export const DEV_SEED_PASSWORD = "demo-en-escena";

const seededEmails = [DEV_SEED_ADMIN_EMAIL, DEV_SEED_ACADEMY_EMAIL];
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
  await createRosterAndChoreography({
    academyId: academy.id,
    eventId: activeEvent.id,
    catalog,
  });

  return { deactivatedEventNames: deactivated.map(({ name }) => name) };
}

async function createVerifiedUser(input: {
  email: string;
  name: string;
  role: "academy" | "admin";
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
  const [schedule] = await db
    .insert(schedules)
    .values({
      eventId,
      name: "Bloque mañana",
      scheduledDate: format(event.startsAt, "yyyy-MM-dd"),
      startTime: "10:00",
      totalCapacity: 20,
      registrationOpen: true,
    })
    .returning();
  await db
    .insert(scheduleModalities)
    .values({ scheduleId: schedule.id, modalityId: modality.id });
  const [scheduleCapacity] = await db
    .insert(scheduleCapacities)
    .values({ scheduleId: schedule.id, groupType: "solo", capacity: 10 })
    .returning();
  await db.insert(prices).values({
    eventId,
    name: "Precio solista",
    groupType: "solo",
    amount: 25000,
    paymentDeadline: null,
    scheduleId: null,
  });

  return { modality, submodality, scheduleCapacity };
}

async function createRosterAndChoreography(input: {
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

  expectOk(
    await createChoreographyRegistration({
      academyId: input.academyId,
      eventId: input.eventId,
      name: "Luna de Papel",
      modalityId: input.catalog.modality.id,
      submodalityId: input.catalog.submodality.id,
      dancerIds: [dancerIds[0]],
      professorIds: [professorIds[0]],
      experienceLevelId: null,
      scheduleCapacityId: input.catalog.scheduleCapacity.id,
    }),
    "register the choreography",
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
