import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import {
  academies,
  categories,
  categoryExperienceLevels,
  categoryModalities,
  choreographies,
  choreographyDancers,
  choreographyProfessors,
  dancers,
  events,
  experienceLevels,
  modalities,
  prices,
  professors,
  scheduleModalities,
  schedules,
  scheduleCapacities,
  submodalities,
  user,
} from "@/db/schema";
import { createLocalAccessUser } from "@/lib/auth/access-test-auth.server";
import {
  createCategory,
  createExperienceLevel,
  createModality,
  createPrice,
  createSchedule,
  createScheduleCapacity,
  createSubmodality,
} from "@/lib/events/bases-repository.server";
import { activateEvent, createEvent } from "@/lib/events/management.server";
import { loadCreateChoreographyRouteData } from "@/features/portal/choreographies/create/server";
import {
  handlePortalChoreographiesListAction,
  loadPortalChoreographiesList,
} from "@/features/portal/choreographies/list/server";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

installDatabaseTestHooks();

describe.sequential("handlePortalChoreographiesListAction", () => {
  test("exposes when there is no active event even if there are events to consult", async () => {
    const session = await createAcademySession({
      email: "coreografias.no-active-event@example.com",
      academyName: "Academia sin Evento Activo",
    });
    await createSavedEvent({
      name: "Regional 2026",
      startsAt: date("2026-05-01T12:00:00Z"),
      endsAt: date("2026-05-03T12:00:00Z"),
    });

    const loaderData = await loadPortalChoreographiesList(
      new Request("http://localhost/portal/coreografias", {
        headers: { cookie: session.cookie },
      }),
    );

    expect(loaderData.eventContext.hasActiveEvent).toBe(false);
    expect(loaderData.eventContext.activeEventRegistrationReadiness).toBeNull();
  });

  test("exposes when the active event lacks minimum bases for registration", async () => {
    const session = await createAcademySession({
      email: "coreografias.incomplete-bases@example.com",
      academyName: "Academia Bases Incompletas",
    });
    const activeEvent = await createSavedEvent({
      name: "Regional 2026",
      registrationStartsAt: date("2026-06-01T12:00:00Z"),
      registrationEndsAt: date("2026-06-30T12:00:00Z"),
      startsAt: date("2026-07-01T12:00:00Z"),
      endsAt: date("2026-07-03T12:00:00Z"),
    });
    await activateEvent(activeEvent.id);

    const modality = await expectCreated(
      createModality(activeEvent.id, { name: "Jazz" }),
    );
    const level = await expectCreated(
      createExperienceLevel(activeEvent.id, { name: "Inicial" }),
    );
    await expectCreated(
      createSubmodality(activeEvent.id, {
        modalityId: modality.id,
        name: "Lyrical",
      }),
    );
    await expectCreated(
      createCategory(activeEvent.id, {
        name: "Juvenil",
        minAge: 13,
        maxAge: 17,
        groupTypes: ["solo"],
        modalityIds: [modality.id],
        experienceLevelIds: [level.id],
      }),
    );
    const block = await expectCreated(
      createSchedule(activeEvent.id, {
        name: "Domingo mañana",
        scheduledDate: "2026-05-03",
        startTime: "10:00",
        totalCapacity: 12,
        modalityIds: [modality.id],
      }),
    );
    await expectCreated(
      createScheduleCapacity(block.id, {
        groupType: "solo",
        capacity: 8,
      }),
    );

    const loaderData = await loadPortalChoreographiesList(
      new Request("http://localhost/portal/coreografias", {
        headers: { cookie: session.cookie },
      }),
    );

    expect(loaderData.eventContext.hasActiveEvent).toBe(true);
    expect(
      loaderData.eventContext.activeEventRegistrationReadiness,
    ).toMatchObject({
      isReady: false,
      missingItems: expect.arrayContaining([
        expect.objectContaining({ code: "price-coverage" }),
      ]),
    });
  });

  test("keeps list loader focused and loads create options from the create resource", async () => {
    const session = await createAcademySession({
      email: "coreografias.crear@example.com",
      academyName: "Academia Crear Coreografía",
    });
    const activeEvent = await createSavedEvent({
      name: "Regional 2026",
      registrationStartsAt: date("2026-06-01T12:00:00Z"),
      registrationEndsAt: date("2026-06-30T12:00:00Z"),
      startsAt: date("2026-07-01T12:00:00Z"),
      endsAt: date("2026-07-03T12:00:00Z"),
    });
    await activateEvent(activeEvent.id);
    const modality = await expectCreated(
      createModality(activeEvent.id, { name: "Jazz" }),
    );
    const submodality = await expectCreated(
      createSubmodality(activeEvent.id, {
        modalityId: modality.id,
        name: "Lyrical",
      }),
    );
    await db.insert(dancers).values({
      academyId: session.academyId,
      firstName: "Ana",
      lastName: "Paz",
      birthDate: "2014-01-01",
      active: true,
    });
    await db.insert(professors).values({
      academyId: session.academyId,
      firstName: "Luz",
      lastName: "Suárez",
      active: true,
    });
    const request = new Request("http://localhost/portal/coreografias", {
      headers: { cookie: session.cookie },
    });

    const listData = await loadPortalChoreographiesList(request);
    const createOptionsData = await loadCreateChoreographyRouteData(
      new Request("http://localhost/portal/coreografias/crear", {
        headers: { cookie: session.cookie },
      }),
    );

    expect(listData).toMatchObject({
      activeDancerCount: 1,
      choreographies: [],
    });
    expect(listData).not.toHaveProperty("activeDancers");
    expect(listData).not.toHaveProperty("activeProfessors");
    expect(listData).not.toHaveProperty("registrationBaseOptions");
    expect(createOptionsData).toMatchObject({
      activeDancers: [expect.objectContaining({ firstName: "Ana" })],
      activeProfessors: [expect.objectContaining({ firstName: "Luz" })],
      registrationBaseOptions: {
        modalities: [{ id: modality.id, name: "Jazz" }],
        submodalities: [
          {
            id: submodality.id,
            modalityId: modality.id,
            name: "Lyrical",
          },
        ],
      },
    });
  });

  test("lists only the authenticated Academia choreographies for the active Evento and derives operational pending items", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Dueña",
      email: "coreografias.owner@example.com",
    });
    const other = await createAcademySession({
      academyName: "Academia Ajena",
      email: "coreografias.other@example.com",
    });
    const selectedEvent = await createEventRecord({
      active: true,
      name: "Regional 2025",
      startsAt: date("2025-10-10T12:00:00Z"),
      endsAt: date("2025-10-12T12:00:00Z"),
    });
    const activeEvent = await createEventRecord({
      active: false,
      name: "Regional 2026",
      startsAt: date("2026-10-10T12:00:00Z"),
      endsAt: date("2026-10-12T12:00:00Z"),
    });
    const selectedCatalog = await createEventCatalog(selectedEvent.id);
    const ownerDancer = await createDancer(owner.academyId, {
      firstName: "Ana",
      lastName: "Paz",
      birthDate: "2012-01-10",
    });
    const ownerProfessor = await createProfessor(owner.academyId, {
      firstName: "Lucía",
      lastName: "Suárez",
    });

    const completeChoreography = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: selectedCatalog.categoryWithLevel.id,
      eventId: selectedEvent.id,
      experienceLevelId: selectedCatalog.level.id,
      modalityId: selectedCatalog.modality.id,
      musicStorageKey: "music/complete.mp3",
      name: "Final Completa",
      scheduleCapacityId: selectedCatalog.scheduleCapacity.id,
      submodalityId: selectedCatalog.submodality.id,
    });
    await db.insert(choreographyDancers).values({
      choreographyId: completeChoreography.id,
      dancerId: ownerDancer.id,
      ageAtEventStart: 13,
    });
    await db.insert(choreographyProfessors).values({
      choreographyId: completeChoreography.id,
      professorId: ownerProfessor.id,
    });

    const missingMusic = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: selectedCatalog.categoryWithLevel.id,
      eventId: selectedEvent.id,
      experienceLevelId: selectedCatalog.level.id,
      modalityId: selectedCatalog.modality.id,
      musicStorageKey: null,
      name: "Sin Música",
      scheduleCapacityId: selectedCatalog.scheduleCapacity.id,
      submodalityId: selectedCatalog.submodality.id,
    });
    await db.insert(choreographyDancers).values({
      choreographyId: missingMusic.id,
      dancerId: ownerDancer.id,
      ageAtEventStart: 13,
    });
    await db.insert(choreographyProfessors).values({
      choreographyId: missingMusic.id,
      professorId: ownerProfessor.id,
    });

    const missingCategory = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: null,
      eventId: selectedEvent.id,
      experienceLevelId: null,
      modalityId: selectedCatalog.modality.id,
      musicStorageKey: "music/category.mp3",
      name: "Sin Categoría",
      scheduleCapacityId: selectedCatalog.scheduleCapacity.id,
      submodalityId: null,
    });
    await db.insert(choreographyDancers).values({
      choreographyId: missingCategory.id,
      dancerId: ownerDancer.id,
      ageAtEventStart: 13,
    });
    await db.insert(choreographyProfessors).values({
      choreographyId: missingCategory.id,
      professorId: ownerProfessor.id,
    });

    const missingLevel = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: selectedCatalog.categoryWithLevel.id,
      eventId: selectedEvent.id,
      experienceLevelId: null,
      modalityId: selectedCatalog.modality.id,
      musicStorageKey: "music/level.mp3",
      name: "Sin Nivel",
      scheduleCapacityId: selectedCatalog.scheduleCapacity.id,
      submodalityId: null,
    });
    await db.insert(choreographyDancers).values({
      choreographyId: missingLevel.id,
      dancerId: ownerDancer.id,
      ageAtEventStart: 13,
    });
    await db.insert(choreographyProfessors).values({
      choreographyId: missingLevel.id,
      professorId: ownerProfessor.id,
    });

    const missingProfessors = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: selectedCatalog.categoryWithoutLevel.id,
      eventId: selectedEvent.id,
      experienceLevelId: null,
      modalityId: selectedCatalog.modality.id,
      musicStorageKey: "music/profesores.mp3",
      name: "Sin Profesores",
      scheduleCapacityId: selectedCatalog.scheduleCapacity.id,
      submodalityId: null,
    });
    await db.insert(choreographyDancers).values({
      choreographyId: missingProfessors.id,
      dancerId: ownerDancer.id,
      ageAtEventStart: 13,
    });

    const otherEventCatalog = await createEventCatalog(activeEvent.id);
    const ownerOtherEvent = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: otherEventCatalog.categoryWithLevel.id,
      eventId: activeEvent.id,
      experienceLevelId: otherEventCatalog.level.id,
      modalityId: otherEventCatalog.modality.id,
      musicStorageKey: "music/other-event.mp3",
      name: "Otro Evento",
      scheduleCapacityId: otherEventCatalog.scheduleCapacity.id,
      submodalityId: null,
    });
    await db.insert(choreographyDancers).values({
      choreographyId: ownerOtherEvent.id,
      dancerId: ownerDancer.id,
      ageAtEventStart: 14,
    });

    const otherAcademyDancer = await createDancer(other.academyId, {
      firstName: "Beto",
      lastName: "Ruiz",
      birthDate: "2011-03-04",
    });
    const otherAcademyChoreography = await createChoreographyRecord({
      academyId: other.academyId,
      categoryId: selectedCatalog.categoryWithLevel.id,
      eventId: selectedEvent.id,
      experienceLevelId: selectedCatalog.level.id,
      modalityId: selectedCatalog.modality.id,
      musicStorageKey: "music/other-academy.mp3",
      name: "Otra Academia",
      scheduleCapacityId: selectedCatalog.scheduleCapacity.id,
      submodalityId: null,
    });
    await db.insert(choreographyDancers).values({
      choreographyId: otherAcademyChoreography.id,
      dancerId: otherAcademyDancer.id,
      ageAtEventStart: 14,
    });

    const loaderData = await loadPortalChoreographiesList(
      new Request(
        `http://localhost/portal/coreografias?evento=${selectedEvent.id}`,
        {
          headers: { cookie: owner.cookie },
        },
      ),
    );

    expect(loaderData.choreographies.map((row) => row.name)).toEqual([
      "Sin Profesores",
      "Sin Nivel",
      "Sin Categoría",
      "Sin Música",
      "Final Completa",
    ]);
    expect(loaderData.choreographies).toMatchObject([
      {
        name: "Sin Profesores",
        operationalStatus: {
          code: "incomplete",
          pendingItems: ["professors"],
        },
      },
      {
        name: "Sin Nivel",
        operationalStatus: {
          code: "incomplete",
          pendingItems: ["experienceLevel"],
        },
      },
      {
        name: "Sin Categoría",
        operationalStatus: {
          code: "incomplete",
          pendingItems: ["category"],
        },
      },
      {
        name: "Sin Música",
        operationalStatus: {
          code: "incomplete",
          pendingItems: ["music"],
        },
      },
      {
        name: "Final Completa",
        operationalStatus: {
          code: "complete",
          pendingItems: [],
        },
      },
    ]);
  });

  test("creates a choreography and redirects back to the active-event list", async () => {
    const ownerSession = await createAcademySession({
      email: "coreografias.create.owner@example.com",
      academyName: "Academia Creadora",
    });
    const event = await createSavedEvent({
      name: "Regional 2026",
      registrationStartsAt: date("2026-06-01T12:00:00Z"),
      registrationEndsAt: date("2026-06-30T12:00:00Z"),
      startsAt: date("2026-07-01T12:00:00Z"),
      endsAt: date("2026-07-03T12:00:00Z"),
    });
    await activateEvent(event.id);
    const modality = await expectCreated(
      createModality(event.id, { name: "Jazz" }),
    );
    const level = await expectCreated(
      createExperienceLevel(event.id, { name: "Inicial" }),
    );
    const submodality = await expectCreated(
      createSubmodality(event.id, {
        modalityId: modality.id,
        name: "Lyrical",
      }),
    );
    const category = await expectCreated(
      createCategory(event.id, {
        name: "Juvenil",
        minAge: 11,
        maxAge: 12,
        groupTypes: ["solo"],
        modalityIds: [modality.id],
        experienceLevelIds: [level.id],
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
        paymentDeadline: "2026-05-31",
        scheduleId: block.id,
      }),
    );
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

    const response = await expectThrownResponse(
      handlePortalChoreographiesListAction(
        createPortalPostRequest(
          `http://localhost/portal/coreografias?evento=${event.id}`,
          ownerSession.cookie,
          choreographyFormData({
            eventId: event.id,
            name: " danza de la luna ",
            modalityId: modality.id,
            submodalityId: submodality.id,
            dancerIds: [dancer.id],
            professorIds: [professor.id],
            experienceLevelId: level.id,
            scheduleCapacityId: scheduleCapacity.id,
          }),
        ),
      ),
      302,
    );

    expect(response.headers.get("Location")).toBe(
      "/portal/coreografias?creada=1",
    );

    const [storedChoreography] = await db.query.choreographies.findMany({
      where: eq(choreographies.academyId, ownerSession.academyId),
    });
    expect(storedChoreography).toMatchObject({
      eventId: event.id,
      name: "Danza de la Luna",
      categoryId: category.id,
      experienceLevelId: level.id,
      scheduleCapacityId: scheduleCapacity.id,
    });

    const storedDancers = await db.query.choreographyDancers.findMany({
      where: eq(choreographyDancers.choreographyId, storedChoreography.id),
    });
    expect(storedDancers).toHaveLength(1);

    const storedProfessors = await db.query.choreographyProfessors.findMany({
      where: eq(choreographyProfessors.choreographyId, storedChoreography.id),
    });
    expect(storedProfessors).toHaveLength(1);
  });
});

async function createAcademySession({
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
      phone: "1112345678",
    })
    .returning();

  return {
    academyId: academy.id,
    cookie: createRequestCookie(signUpResult.headers),
  };
}

function createPortalPostRequest(
  requestUrl: string,
  cookie: string,
  body: FormData,
) {
  return new Request(requestUrl, {
    method: "POST",
    headers: { cookie },
    body,
  });
}

function choreographyFormData(input: {
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

  return values;
}

async function createSavedEvent(
  overrides: Partial<Parameters<typeof createEvent>[0]> = {},
) {
  const result = await createEvent({
    name: "Evento",
    registrationStartsAt: date("2026-03-01T12:00:00Z"),
    registrationEndsAt: date("2026-04-30T12:00:00Z"),
    startsAt: date("2026-05-01T12:00:00Z"),
    endsAt: date("2026-05-03T12:00:00Z"),
    ...overrides,
  });

  if (!result.ok) {
    throw new Error(result.error);
  }

  return result.event;
}

async function createEventRecord(
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

async function createEventCatalog(eventId: string) {
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
  const [categoryWithLevel] = await db
    .insert(categories)
    .values({
      eventId,
      name: `Juvenil ${eventId}`,
      minAge: 13,
      maxAge: 17,
      groupTypes: ["solo"],
      groupTypeKey: "solo",
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
  await db.insert(categoryExperienceLevels).values({
    categoryId: categoryWithLevel.id,
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
    scheduleCapacity,
    submodality,
  };
}

async function createDancer(
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

async function createProfessor(
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

async function createChoreographyRecord(
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

function createRequestCookie(headers: Headers) {
  const setCookie = headers.get("set-cookie");

  if (!setCookie) {
    throw new Error("Expected access auth to return a session cookie.");
  }

  const sessionCookie = setCookie.match(/sb-access-token=([^;]+)/);

  if (!sessionCookie?.[1]) {
    throw new Error("Expected access auth to return a session cookie.");
  }

  return `sb-access-token=${sessionCookie[1]}`;
}

function date(value: string) {
  return new Date(value);
}

async function expectCreated(
  resultPromise: Promise<{
    ok: boolean;
    record?: { id: string };
  }>,
) {
  const result = await resultPromise;

  if (!result.ok || !result.record) {
    throw new Error("Expected Bases del evento creation to succeed.");
  }

  return result.record;
}

async function expectThrownResponse(
  promise: Promise<unknown>,
  expectedStatus?: number,
) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Response) {
      if (expectedStatus !== undefined) {
        expect(error.status).toBe(expectedStatus);
      }

      return error;
    }

    throw error;
  }

  throw new Error("Expected a Response to be thrown.");
}
