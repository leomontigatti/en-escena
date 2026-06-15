import { and, eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import {
  academies,
  choreographies,
  choreographyDancers,
  choreographyProfessors,
  dancers,
  professors,
  user,
} from "@/db/schema";
import {
  createCategory,
  createExperienceLevel,
  createModality,
  createPrice,
  createScheduleBlock,
  createScheduleEntry,
  createSubmodality,
} from "@/lib/events/bases-repository.server";
import { auth } from "@/lib/auth/auth.server";
import { activateEvent, createEvent } from "@/lib/events/management.server";
import { loader as portalLoader } from "@/routes/portal";
import {
  action as bailarinesAction,
  loader as bailarinesLoader,
} from "@/routes/portal.bailarines";
import {
  action as bailarinesDetalleAction,
  loader as bailarinesDetalleLoader,
} from "@/routes/portal.bailarines.$dancerId";
import {
  action as coreografiasAction,
  loader as coreografiasLoader,
} from "@/routes/portal.coreografias";
import {
  action as profesoresAction,
  loader as profesoresLoader,
} from "@/routes/portal.profesores";
import {
  action as profesorAction,
  loader as profesorLoader,
} from "@/routes/portal.profesores.$professorId";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

describe.sequential("portal loader Evento activo", () => {
  test("uses the active Evento and exposes every Evento for future display", async () => {
    const historicalEvent = await createSavedEvent({
      name: "Regional 2025",
      registrationStartsAt: date("2025-03-01T12:00:00Z"),
      registrationEndsAt: date("2025-04-30T12:00:00Z"),
      startsAt: date("2025-05-01T12:00:00Z"),
      endsAt: date("2025-05-03T12:00:00Z"),
    });
    const activeEvent = await createSavedEvent({
      name: "Regional 2026",
      startsAt: date("2026-05-01T12:00:00Z"),
      endsAt: date("2026-05-03T12:00:00Z"),
    });
    await activateEvent(activeEvent.id);

    const loaderData = await loadPortal("http://localhost/portal");

    expect(loaderData.eventContext.selectedEvent).toMatchObject({
      id: activeEvent.id,
      name: "Regional 2026",
      active: true,
    });
    expect(loaderData.eventContext.events.map((event) => event.id)).toEqual([
      activeEvent.id,
      historicalEvent.id,
    ]);
  });

  test("ignores the event URL query and keeps using the active Evento", async () => {
    const selectedEvent = await createSavedEvent({ name: "Seleccionado" });
    const activeEvent = await createSavedEvent({
      name: "Activo",
      startsAt: date("2027-05-01T12:00:00Z"),
      endsAt: date("2027-05-03T12:00:00Z"),
      registrationStartsAt: date("2027-03-01T12:00:00Z"),
      registrationEndsAt: date("2027-04-30T12:00:00Z"),
    });
    await activateEvent(activeEvent.id);

    const loaderData = await loadPortal(
      `http://localhost/portal?evento=${selectedEvent.id}`,
    );

    expect(loaderData.eventContext.selectedEvent).toMatchObject({
      id: activeEvent.id,
      name: "Activo",
      active: true,
    });
    expect(loaderData.eventContext.isReadOnly).toBe(false);
  });

  test("does not fall back to the most recent Evento when no Evento is active", async () => {
    const olderEvent = await createSavedEvent({
      name: "Regional 2025",
      registrationStartsAt: date("2025-03-01T12:00:00Z"),
      registrationEndsAt: date("2025-04-30T12:00:00Z"),
      startsAt: date("2025-05-01T12:00:00Z"),
      endsAt: date("2025-05-03T12:00:00Z"),
    });
    const recentEvent = await createSavedEvent({
      name: "Regional 2026",
      startsAt: date("2026-05-01T12:00:00Z"),
      endsAt: date("2026-05-03T12:00:00Z"),
    });

    const loaderData = await loadPortal("http://localhost/portal");

    expect(loaderData.eventContext.selectedEvent).toBeNull();
    expect(loaderData.eventContext.events.map((event) => event.id)).toEqual([
      recentEvent.id,
      olderEvent.id,
    ]);
  });

  test("keeps the portal accessible when there are no Eventos", async () => {
    const loaderData = await loadPortal("http://localhost/portal");

    expect(loaderData.academy).toMatchObject({
      name: "Academia de Prueba",
    });
    expect(loaderData.eventContext).toMatchObject({
      hasEvents: false,
      selectedEvent: null,
      isReadOnly: true,
      isRegistrationOpen: false,
    });
  });

  test("builds dashboard summary counts from active academy data and the active event", async () => {
    const session = await createAcademySession({
      email: "dashboard@example.com",
      academyName: "Academia Dashboard",
    });
    const activeEvent = await createSavedEvent({
      name: "Regional 2026",
      registrationStartsAt: date("2026-06-01T12:00:00Z"),
      registrationEndsAt: date("2026-06-30T12:00:00Z"),
      startsAt: date("2026-07-01T12:00:00Z"),
      endsAt: date("2026-07-03T12:00:00Z"),
    });
    await activateEvent(activeEvent.id);

    const [completeProfessor] = await db
      .insert(professors)
      .values({
        academyId: session.academyId,
        firstName: "Ana",
        lastName: "Completa",
        documentType: "dni",
        documentNumber: "12345678",
      })
      .returning();
    await db.insert(professors).values([
      {
        academyId: session.academyId,
        firstName: "Bea",
        lastName: "Incompleta",
      },
      {
        academyId: session.academyId,
        firstName: "Cora",
        lastName: "Archivada",
        active: false,
      },
    ]);
    const [incompleteDancer, completeDancer] = await db
      .insert(dancers)
      .values([
        {
          academyId: session.academyId,
          firstName: "Dora",
          lastName: "Activa",
          birthDate: "2013-05-01",
        },
        {
          academyId: session.academyId,
          firstName: "Eva",
          lastName: "Documento",
          birthDate: "2012-04-01",
          documentType: "dni",
          documentNumber: "99887766",
        },
      ])
      .returning();
    await db.insert(dancers).values({
      academyId: session.academyId,
      firstName: "Fiona",
      lastName: "Archivada",
      birthDate: "2011-03-01",
      active: false,
    });

    const modality = await expectCreated(
      createModality(activeEvent.id, { name: "Jazz" }),
    );
    const level = await expectCreated(
      createExperienceLevel(activeEvent.id, { name: "Inicial" }),
    );
    const submodality = await expectCreated(
      createSubmodality(activeEvent.id, {
        modalityId: modality.id,
        name: "Lyrical",
      }),
    );
    const category = await expectCreated(
      createCategory(activeEvent.id, {
        name: "Juvenil",
        minAge: 13,
        maxAge: 17,
        groupTypes: ["solo"],
        modalityIds: [modality.id],
        experienceLevelIds: [level.id],
      }),
    );
    await expectCreated(
      createPrice(activeEvent.id, {
        name: "Solo general",
        groupType: "solo",
        amount: 1000,
        scheduleBlockId: null,
      }),
    );
    const block = await expectCreated(
      createScheduleBlock(activeEvent.id, {
        name: "Domingo mañana",
        scheduledDate: "2026-07-03",
        startTime: "10:00",
        totalCapacity: 12,
        modalityIds: [modality.id],
      }),
    );
    const entry = await expectCreated(
      createScheduleEntry(block.id, {
        groupTypes: ["solo"],
        capacity: 8,
      }),
    );
    const [completeChoreography, incompleteChoreography] = await db
      .insert(choreographies)
      .values([
        {
          academyId: session.academyId,
          eventId: activeEvent.id,
          name: "Completa",
          groupType: "solo",
          modalityId: modality.id,
          submodalityId: submodality.id,
          categoryId: category.id,
          categoryAgeBasis: 13,
          categoryCalculationMode: "oldest",
          experienceLevelId: level.id,
          scheduleEntryId: entry.id,
          musicStorageKey: "music.mp3",
        },
        {
          academyId: session.academyId,
          eventId: activeEvent.id,
          name: "Incompleta",
          groupType: "solo",
          modalityId: modality.id,
          submodalityId: submodality.id,
          categoryId: null,
          categoryAgeBasis: 13,
          categoryCalculationMode: "oldest",
          experienceLevelId: null,
          scheduleEntryId: entry.id,
          musicStorageKey: null,
        },
      ])
      .returning();
    await db.insert(choreographyDancers).values([
      {
        choreographyId: completeChoreography.id,
        dancerId: completeDancer.id,
        ageAtEventStart: 13,
      },
      {
        choreographyId: incompleteChoreography.id,
        dancerId: incompleteDancer.id,
        ageAtEventStart: 14,
      },
    ]);
    await db.insert(choreographyProfessors).values([
      {
        choreographyId: completeChoreography.id,
        professorId: completeProfessor.id,
      },
    ]);

    const loaderData = await portalLoader({
      request: new Request("http://localhost/portal", {
        headers: { cookie: session.cookie },
      }),
      params: {},
      context: {},
      url: new URL("http://localhost/portal"),
      pattern: "/portal",
    });

    expect(loaderData.dashboardSummary).toEqual({
      professors: {
        activeCount: 2,
        incompleteCount: 1,
      },
      dancers: {
        activeCount: 2,
        incompleteCount: 2,
      },
      choreographies: {
        registeredCount: 2,
        incompleteCount: 1,
      },
    });
  });

  test("exposes when there is no Evento activo even if there are Eventos to consult", async () => {
    await createSavedEvent({
      name: "Regional 2026",
      startsAt: date("2026-05-01T12:00:00Z"),
      endsAt: date("2026-05-03T12:00:00Z"),
    });

    const loaderData = await coreografiasLoader({
      request: await createAcademyRequest(
        "http://localhost/portal/coreografias",
      ),
    });

    expect(loaderData.eventContext.hasActiveEvent).toBe(false);
    expect(loaderData.eventContext.activeEventRegistrationReadiness).toBeNull();
  });

  test("exposes when the Evento activo lacks minimum bases for registration", async () => {
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
      createScheduleBlock(activeEvent.id, {
        name: "Domingo mañana",
        scheduledDate: "2026-05-03",
        startTime: "10:00",
        totalCapacity: 12,
        modalityIds: [modality.id],
      }),
    );
    await expectCreated(
      createScheduleEntry(block.id, {
        groupTypes: ["solo"],
        capacity: 8,
      }),
    );

    const loaderData = await coreografiasLoader({
      request: await createAcademyRequest(
        "http://localhost/portal/coreografias",
      ),
    });

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
});

describe.sequential("portal people list loaders", () => {
  test.each([
    ["Bailarines", bailarinesLoader, "http://localhost/portal/bailarines"],
    [
      "Coreografías",
      coreografiasLoader,
      "http://localhost/portal/coreografias",
    ],
    ["Profesores", profesoresLoader, "http://localhost/portal/profesores"],
  ])(
    "allows an Academia user to access %s",
    async (_name, routeLoader, url) => {
      const loaderData = await routeLoader({
        request: await createAcademyRequest(url),
      });

      expect(loaderData.academy).toMatchObject({
        name: "Academia de Prueba",
      });
      expect(loaderData.email).toBe("academia@example.com");
    },
  );

  test.each([
    ["Bailarines", bailarinesLoader, "http://localhost/portal/bailarines"],
    [
      "Coreografías",
      coreografiasLoader,
      "http://localhost/portal/coreografias",
    ],
    ["Profesores", profesoresLoader, "http://localhost/portal/profesores"],
  ])("blocks internal users from %s", async (_name, routeLoader, url) => {
    const response = await expectThrownResponse(
      routeLoader({
        request: await createInternalRequest(url),
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.text()).resolves.toBe(
      "Los usuarios internos no pueden acceder al portal.",
    );
  });
});

describe.sequential("portal Coreografías route", () => {
  test("creates a Coreografía from the route action and redirects back to the active-event list", async () => {
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
      createScheduleBlock(event.id, {
        name: "Domingo mañana",
        scheduledDate: "2026-05-03",
        startTime: "10:00",
        totalCapacity: 12,
        modalityIds: [modality.id],
      }),
    );
    const scheduleEntry = await expectCreated(
      createScheduleEntry(block.id, {
        groupTypes: ["solo"],
        capacity: 8,
      }),
    );
    await expectCreated(
      createPrice(event.id, {
        name: "Precio base",
        groupType: "solo",
        amount: 15000,
        scheduleBlockId: block.id,
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
      coreografiasAction({
        request: createPortalPostRequest(
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
            scheduleEntryId: scheduleEntry.id,
          }),
        ),
      }),
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
      scheduleEntryId: scheduleEntry.id,
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

describe.sequential("portal Bailarines route", () => {
  test("creates normalized Bailarines for the signed-in Academia, redirects with notificacion and loads active plus archived rows for client filtering", async () => {
    const ownerSession = await createAcademySession({
      email: "bailarines.owner@example.com",
      academyName: "Academia Dueña",
    });
    const otherAcademy = await createAcademyRecord({
      email: "bailarines.other@example.com",
      academyName: "Academia Ajena",
    });
    await db.insert(dancers).values({
      academyId: ownerSession.academyId,
      firstName: "Beto",
      lastName: "Archivado",
      birthDate: "2013-02-02",
      active: false,
    });

    const createResponse = await expectThrownResponse(
      bailarinesAction({
        request: createPortalPostRequest(
          "http://localhost/portal/bailarines",
          ownerSession.cookie,
          dancerFormData({
            firstName: "  juan manuel ",
            lastName: " cruz de la torre ",
            birthDate: "2015-04-03",
          }),
        ),
      }),
      302,
    );
    expect(createResponse.headers.get("location")).toBe(
      "/portal/bailarines?notificacion=bailarin-creado",
    );
    await expectThrownResponse(
      bailarinesAction({
        request: createPortalPostRequest(
          "http://localhost/portal/bailarines",
          ownerSession.cookie,
          dancerFormData({
            firstName: "ana",
            lastName: "ALVAREZ",
            birthDate: "2014-02-01",
          }),
        ),
      }),
    );
    await db.insert(dancers).values({
      academyId: otherAcademy.id,
      firstName: "Otra",
      lastName: "Academia",
      birthDate: "2013-01-01",
    });

    const ownerLoaderData = await bailarinesLoader({
      request: new Request("http://localhost/portal/bailarines", {
        headers: { cookie: ownerSession.cookie },
      }),
    });

    expect(ownerLoaderData.dancers).toMatchObject([
      {
        firstName: "Ana",
        lastName: "Alvarez",
        birthDate: "2014-02-01",
        active: true,
        documentNumber: null,
        verificationStatus: "incomplete",
      },
      {
        firstName: "Beto",
        lastName: "Archivado",
        birthDate: "2013-02-02",
        active: false,
        documentNumber: null,
        verificationStatus: "incomplete",
      },
      {
        firstName: "Juan Manuel",
        lastName: "Cruz de la Torre",
        birthDate: "2015-04-03",
        active: true,
        documentNumber: null,
        verificationStatus: "incomplete",
      },
    ]);
    expect(ownerLoaderData.dancers).toHaveLength(3);

    await expect(
      db.query.dancers.findFirst({
        where: and(
          eq(dancers.academyId, ownerSession.academyId),
          eq(dancers.firstName, "Juan Manuel"),
        ),
      }),
    ).resolves.toMatchObject({
      firstName: "Juan Manuel",
      lastName: "Cruz de la Torre",
      birthDate: "2015-04-03",
    });
  });

  test("rejects future Bailarín birth dates without creating a record", async () => {
    const session = await createAcademySession({
      email: "bailarines.future@example.com",
      academyName: "Academia Futuro",
    });

    const result = await bailarinesAction({
      request: createPortalPostRequest(
        "http://localhost/portal/bailarines",
        session.cookie,
        dancerFormData({
          firstName: "Martina",
          lastName: "López",
          birthDate: "2999-01-01",
        }),
      ),
    });

    expect(result).toMatchObject({
      status: "error",
      fieldErrors: {
        birthDate: "La fecha de nacimiento no puede ser futura.",
      },
      values: {
        firstName: "Martina",
        lastName: "López",
        birthDate: "2999-01-01",
      },
    });
    await expect(db.query.dancers.findMany()).resolves.toEqual([]);
  });

  test("updates a Bailarín in place and normalizes DNI documents", async () => {
    const session = await createAcademySession({
      email: "bailarines.edit@example.com",
      academyName: "Academia Edición",
    });
    const [dancer] = await db
      .insert(dancers)
      .values({
        academyId: session.academyId,
        firstName: "Ana",
        lastName: "Alvarez",
        birthDate: "2014-02-01",
      })
      .returning();

    const response = await expectThrownResponse(
      bailarinesDetalleAction({
        request: createPortalPostRequest(
          `http://localhost/portal/bailarines/${dancer.id}`,
          session.cookie,
          dancerEditFormData({
            firstName: "  ana maría ",
            lastName: " de la CRUZ ",
            birthDate: "2014-05-06",
            documentType: "dni",
            documentNumber: "12.345 678-9",
          }),
        ),
        params: { dancerId: dancer.id },
      }),
      302,
    );

    expect(response.headers.get("location")).toBe(
      `/portal/bailarines/${dancer.id}?guardado=1`,
    );
    await expect(
      db.query.dancers.findFirst({
        where: eq(dancers.id, dancer.id),
      }),
    ).resolves.toMatchObject({
      firstName: "Ana María",
      lastName: "De la Cruz",
      birthDate: "2014-05-06",
      documentType: "dni",
      documentNumber: "123456789",
    });
  });

  test("keeps submitted values and field errors when the document pair is partial", async () => {
    const session = await createAcademySession({
      email: "bailarines.partial@example.com",
      academyName: "Academia Parcial",
    });
    const [dancer] = await db
      .insert(dancers)
      .values({
        academyId: session.academyId,
        firstName: "Ana",
        lastName: "Alvarez",
        birthDate: "2014-02-01",
      })
      .returning();

    const result = await bailarinesDetalleAction({
      request: createPortalPostRequest(
        `http://localhost/portal/bailarines/${dancer.id}`,
        session.cookie,
        dancerEditFormData({
          firstName: "Ana",
          lastName: "Alvarez",
          birthDate: "2014-02-01",
          documentType: "",
          documentNumber: "ABC 123",
        }),
      ),
      params: { dancerId: dancer.id },
    });

    expect(result).toMatchObject({
      ok: false,
      error: "Revisá los datos del Bailarín.",
      fieldErrors: {
        documentType: "Seleccioná el tipo de documento.",
      },
      values: {
        documentType: "",
        documentNumber: "ABC 123",
      },
    });
  });

  test("rejects duplicate complete documents only within the same Academia", async () => {
    const ownerSession = await createAcademySession({
      email: "bailarines.duplicate.owner@example.com",
      academyName: "Academia Dueña",
    });
    const otherSession = await createAcademySession({
      email: "bailarines.duplicate.other@example.com",
      academyName: "Academia Ajena",
    });
    const [ownerExisting] = await db
      .insert(dancers)
      .values({
        academyId: ownerSession.academyId,
        firstName: "Ana",
        lastName: "Alvarez",
        birthDate: "2014-02-01",
        documentType: "passport",
        documentNumber: "AB 123",
      })
      .returning();
    const [ownerEditable] = await db
      .insert(dancers)
      .values({
        academyId: ownerSession.academyId,
        firstName: "Beatriz",
        lastName: "Suarez",
        birthDate: "2013-03-02",
      })
      .returning();
    const [otherEditable] = await db
      .insert(dancers)
      .values({
        academyId: otherSession.academyId,
        firstName: "Clara",
        lastName: "Paz",
        birthDate: "2012-04-01",
      })
      .returning();

    const duplicateResult = await bailarinesDetalleAction({
      request: createPortalPostRequest(
        `http://localhost/portal/bailarines/${ownerEditable.id}`,
        ownerSession.cookie,
        dancerEditFormData({
          firstName: "Beatriz",
          lastName: "Suarez",
          birthDate: "2013-03-02",
          documentType: "passport",
          documentNumber: "  AB   123 ",
        }),
      ),
      params: { dancerId: ownerEditable.id },
    });

    expect(duplicateResult).toMatchObject({
      ok: false,
      fieldErrors: {
        documentNumber:
          "Ya existe un Bailarín con ese documento en tu academia.",
      },
    });
    await expect(
      db.query.dancers.findFirst({
        where: eq(dancers.id, ownerEditable.id),
      }),
    ).resolves.toMatchObject({
      documentType: null,
      documentNumber: null,
    });

    const crossAcademyResponse = await expectThrownResponse(
      bailarinesDetalleAction({
        request: createPortalPostRequest(
          `http://localhost/portal/bailarines/${otherEditable.id}`,
          otherSession.cookie,
          dancerEditFormData({
            firstName: "Clara",
            lastName: "Paz",
            birthDate: "2012-04-01",
            documentType: "passport",
            documentNumber: "AB 123",
          }),
        ),
        params: { dancerId: otherEditable.id },
      }),
      302,
    );

    expect(crossAcademyResponse.headers.get("location")).toBe(
      `/portal/bailarines/${otherEditable.id}?guardado=1`,
    );
    await expect(
      db.query.dancers.findFirst({
        where: eq(dancers.id, otherEditable.id),
      }),
    ).resolves.toMatchObject({
      documentType: "passport",
      documentNumber: "AB 123",
    });
    expect(ownerExisting.id).not.toBe(otherEditable.id);
  });

  test("returns not found when another Academia loads or updates a Bailarín", async () => {
    const ownerSession = await createAcademySession({
      email: "bailarines.owner.scope@example.com",
      academyName: "Academia Dueña",
    });
    const otherSession = await createAcademySession({
      email: "bailarines.other.scope@example.com",
      academyName: "Academia Ajena",
    });
    const [dancer] = await db
      .insert(dancers)
      .values({
        academyId: ownerSession.academyId,
        firstName: "Ana",
        lastName: "Alvarez",
        birthDate: "2014-02-01",
      })
      .returning();

    await expectThrownResponse(
      bailarinesDetalleLoader({
        request: new Request(
          `http://localhost/portal/bailarines/${dancer.id}`,
          {
            headers: { cookie: otherSession.cookie },
          },
        ),
        params: { dancerId: dancer.id },
      }),
      404,
    );

    await expectThrownResponse(
      bailarinesDetalleAction({
        request: createPortalPostRequest(
          `http://localhost/portal/bailarines/${dancer.id}`,
          otherSession.cookie,
          dancerEditFormData({
            firstName: "Ana",
            lastName: "Alvarez",
            birthDate: "2014-02-01",
            documentType: "",
            documentNumber: "",
          }),
        ),
        params: { dancerId: dancer.id },
      }),
      404,
    );
  });

  test("archives and reactivates a Bailarín while keeping direct URL access", async () => {
    const session = await createAcademySession({
      email: "bailarines.archive@example.com",
      academyName: "Academia Archivo",
    });
    const [activeDancer, archivedDancer] = await db
      .insert(dancers)
      .values([
        {
          academyId: session.academyId,
          firstName: "Ana",
          lastName: "Activa",
          birthDate: "2014-02-01",
        },
        {
          academyId: session.academyId,
          firstName: "Beto",
          lastName: "Archivado",
          birthDate: "2013-03-02",
          active: false,
        },
      ])
      .returning();

    const archiveResponse = await expectThrownResponse(
      bailarinesDetalleAction({
        request: createPortalPostRequest(
          `http://localhost/portal/bailarines/${activeDancer.id}`,
          session.cookie,
          formData({ intent: "archive-dancer" }),
        ),
        params: { dancerId: activeDancer.id },
      }),
      302,
    );

    expect(archiveResponse.headers.get("location")).toBe(
      `/portal/bailarines/${activeDancer.id}?guardado=1`,
    );
    await expect(
      db.query.dancers.findFirst({ where: eq(dancers.id, activeDancer.id) }),
    ).resolves.toMatchObject({ active: false });

    const listData = await bailarinesLoader({
      request: new Request("http://localhost/portal/bailarines", {
        headers: { cookie: session.cookie },
      }),
    });
    expect(listData.dancers).toMatchObject([
      { id: activeDancer.id, active: false },
      { id: archivedDancer.id, active: false },
    ]);

    const archivedDetailData = await bailarinesDetalleLoader({
      request: new Request(
        `http://localhost/portal/bailarines/${activeDancer.id}`,
        {
          headers: { cookie: session.cookie },
        },
      ),
      params: { dancerId: activeDancer.id },
    });
    expect(archivedDetailData.dancer).toMatchObject({
      id: activeDancer.id,
      active: false,
    });

    const reactivateResponse = await expectThrownResponse(
      bailarinesDetalleAction({
        request: createPortalPostRequest(
          `http://localhost/portal/bailarines/${activeDancer.id}`,
          session.cookie,
          formData({ intent: "reactivate-dancer" }),
        ),
        params: { dancerId: activeDancer.id },
      }),
      302,
    );

    expect(reactivateResponse.headers.get("location")).toBe(
      `/portal/bailarines/${activeDancer.id}?guardado=1`,
    );
    await expect(
      db.query.dancers.findFirst({ where: eq(dancers.id, activeDancer.id) }),
    ).resolves.toMatchObject({ active: true });
  });
});

describe("portal Profesores management", () => {
  test("creates normalized Profesores, redirects with notificacion and loads active plus archived rows for client filtering", async () => {
    const owner = await createAcademySession({
      email: "profesores.owner@example.com",
      academyName: "Academia Dueña",
    });
    const other = await createAcademySession({
      email: "profesores.other@example.com",
      academyName: "Academia Ajena",
    });

    await db.insert(professors).values({
      academyId: owner.academy.id,
      firstName: "Ana",
      lastName: "Zapata",
    });
    await db.insert(professors).values({
      academyId: owner.academy.id,
      firstName: "Bea",
      lastName: "Archivada",
      active: false,
    });
    await db.insert(professors).values({
      academyId: other.academy.id,
      firstName: "Ajeno",
      lastName: "Alvarez",
    });

    const createRequest = new Request("http://localhost/portal/profesores", {
      method: "POST",
      headers: { cookie: owner.cookie },
      body: formData({
        intent: "create-professor",
        firstName: "  jOSÉ  luis ",
        lastName: " de la CRUZ ",
      }),
    });

    const response = await expectThrownResponse(
      profesoresAction({ request: createRequest }),
      302,
    );

    expect(response.headers.get("location")).toBe(
      "/portal/profesores?notificacion=profesor-creado",
    );

    const loaderData = await profesoresLoader({
      request: new Request("http://localhost/portal/profesores", {
        headers: { cookie: owner.cookie },
      }),
    });

    expect(loaderData.professors).toEqual([
      expect.objectContaining({
        firstName: "Bea",
        lastName: "Archivada",
        active: false,
        documentType: null,
        documentNumber: null,
        isIncomplete: true,
      }),
      expect.objectContaining({
        firstName: "José Luis",
        lastName: "de la Cruz",
        documentType: null,
        documentNumber: null,
        isIncomplete: true,
      }),
      expect.objectContaining({
        firstName: "Ana",
        lastName: "Zapata",
        documentType: null,
        documentNumber: null,
        isIncomplete: true,
      }),
    ]);
  });

  test("updates a Profesor in place with normalized document data and redirects with a route notification", async () => {
    const owner = await createAcademySession({
      email: "profesores.edit.owner@example.com",
      academyName: "Academia Dueña",
    });
    const [professor] = await db
      .insert(professors)
      .values({
        academyId: owner.academy.id,
        firstName: "Ana",
        lastName: "Perez",
      })
      .returning();

    const response = await expectThrownResponse(
      profesorAction({
        request: createPortalPostRequest(
          `http://localhost/portal/profesores/${professor.id}`,
          owner.cookie,
          formData({
            firstName: "  maría del carmen ",
            lastName: " de la cruz ",
            documentType: "dni",
            documentNumber: "12.345-678",
          }),
        ),
        params: { professorId: professor.id },
      }),
      302,
    );

    expect(response.headers.get("location")).toBe(
      `/portal/profesores/${professor.id}?notificacion=profesor-guardado`,
    );
    await expect(
      db.query.professors.findFirst({
        where: eq(professors.id, professor.id),
      }),
    ).resolves.toMatchObject({
      firstName: "María del Carmen",
      lastName: "de la Cruz",
      documentType: "dni",
      documentNumber: "12345678",
    });
    const loaderData = await profesorLoader({
      request: new Request(
        `http://localhost/portal/profesores/${professor.id}`,
        {
          headers: { cookie: owner.cookie },
        },
      ),
      params: { professorId: professor.id },
    });

    expect(loaderData.professor.isIncomplete).toBe(false);
  });

  test("keeps submitted values and field errors when the document pair is incomplete", async () => {
    const owner = await createAcademySession({
      email: "profesores.validation.owner@example.com",
      academyName: "Academia Dueña",
    });
    const [professor] = await db
      .insert(professors)
      .values({
        academyId: owner.academy.id,
        firstName: "Ana",
        lastName: "Perez",
      })
      .returning();

    const result = await profesorAction({
      request: createPortalPostRequest(
        `http://localhost/portal/profesores/${professor.id}`,
        owner.cookie,
        formData({
          firstName: "Ana",
          lastName: "Perez",
          documentType: "dni",
          documentNumber: "",
        }),
      ),
      params: { professorId: professor.id },
    });

    expect(result).toMatchObject({
      status: "error",
      fieldErrors: {
        documentNumber: "Ingresá el número de documento.",
      },
      values: {
        firstName: "Ana",
        lastName: "Perez",
        documentType: "dni",
        documentNumber: "",
      },
    });
    await expect(
      db.query.professors.findFirst({
        where: eq(professors.id, professor.id),
      }),
    ).resolves.toMatchObject({
      documentType: null,
      documentNumber: null,
    });
  });

  test("rejects a duplicate complete document within the same Academia", async () => {
    const owner = await createAcademySession({
      email: "profesores.duplicate.owner@example.com",
      academyName: "Academia Dueña",
    });
    await db.insert(professors).values({
      academyId: owner.academy.id,
      firstName: "Ana",
      lastName: "Perez",
      documentType: "dni",
      documentNumber: "12345678",
    });
    const [professor] = await db
      .insert(professors)
      .values({
        academyId: owner.academy.id,
        firstName: "Bea",
        lastName: "Lopez",
      })
      .returning();

    const result = await profesorAction({
      request: createPortalPostRequest(
        `http://localhost/portal/profesores/${professor.id}`,
        owner.cookie,
        formData({
          firstName: "Bea",
          lastName: "Lopez",
          documentType: "dni",
          documentNumber: "12 345 678",
        }),
      ),
      params: { professorId: professor.id },
    });

    expect(result).toMatchObject({
      status: "error",
      fieldErrors: {
        documentNumber:
          "Ya existe un Profesor con ese documento en tu academia.",
      },
    });
  });

  test("allows the same complete document in another Academia", async () => {
    const owner = await createAcademySession({
      email: "profesores.cross-academy.owner@example.com",
      academyName: "Academia Dueña",
    });
    const other = await createAcademySession({
      email: "profesores.cross-academy.other@example.com",
      academyName: "Academia Ajena",
    });
    await db.insert(professors).values({
      academyId: other.academy.id,
      firstName: "Ajena",
      lastName: "Profesora",
      documentType: "passport",
      documentNumber: "AR 123",
    });
    const [professor] = await db
      .insert(professors)
      .values({
        academyId: owner.academy.id,
        firstName: "Propia",
        lastName: "Profesora",
      })
      .returning();

    await expectThrownResponse(
      profesorAction({
        request: createPortalPostRequest(
          `http://localhost/portal/profesores/${professor.id}`,
          owner.cookie,
          formData({
            firstName: "Propia",
            lastName: "Profesora",
            documentType: "passport",
            documentNumber: "AR 123",
          }),
        ),
        params: { professorId: professor.id },
      }),
      302,
    );

    await expect(
      db.query.professors.findFirst({
        where: eq(professors.id, professor.id),
      }),
    ).resolves.toMatchObject({
      documentType: "passport",
      documentNumber: "AR 123",
    });
  });

  test("allows the same complete document once as Profesor and once as Bailarín in the same Academia", async () => {
    const owner = await createAcademySession({
      email: "profesores.cross-role.owner@example.com",
      academyName: "Academia Dueña",
    });
    await db.insert(dancers).values({
      academyId: owner.academy.id,
      firstName: "Bailarina",
      lastName: "Dual",
      birthDate: "2010-05-10",
      documentType: "other",
      documentNumber: "AB 123",
    });
    const [professor] = await db
      .insert(professors)
      .values({
        academyId: owner.academy.id,
        firstName: "Profesora",
        lastName: "Dual",
      })
      .returning();

    await expectThrownResponse(
      profesorAction({
        request: createPortalPostRequest(
          `http://localhost/portal/profesores/${professor.id}`,
          owner.cookie,
          formData({
            firstName: "Profesora",
            lastName: "Dual",
            documentType: "other",
            documentNumber: "AB 123",
          }),
        ),
        params: { professorId: professor.id },
      }),
      302,
    );

    await expect(
      db.query.professors.findFirst({
        where: eq(professors.id, professor.id),
      }),
    ).resolves.toMatchObject({
      documentType: "other",
      documentNumber: "AB 123",
    });
  });

  test("returns not found when another Academia loads or updates the Profesor", async () => {
    const owner = await createAcademySession({
      email: "profesores.not-found.owner@example.com",
      academyName: "Academia Dueña",
    });
    const other = await createAcademySession({
      email: "profesores.not-found.other@example.com",
      academyName: "Academia Ajena",
    });
    const [professor] = await db
      .insert(professors)
      .values({
        academyId: owner.academy.id,
        firstName: "Ana",
        lastName: "Perez",
      })
      .returning();

    await expectThrownResponse(
      profesorLoader({
        request: new Request(
          `http://localhost/portal/profesores/${professor.id}`,
          {
            headers: { cookie: other.cookie },
          },
        ),
        params: { professorId: professor.id },
      }),
      404,
    );

    await expectThrownResponse(
      profesorAction({
        request: createPortalPostRequest(
          `http://localhost/portal/profesores/${professor.id}`,
          other.cookie,
          formData({
            firstName: "Otra",
            lastName: "Persona",
            documentType: "",
            documentNumber: "",
          }),
        ),
        params: { professorId: professor.id },
      }),
      404,
    );
  });

  test("archives and reactivates a Profesor while keeping direct URL access", async () => {
    const owner = await createAcademySession({
      email: "profesores.archive.owner@example.com",
      academyName: "Academia Archivo",
    });
    const [activeProfessor, archivedProfessor] = await db
      .insert(professors)
      .values([
        {
          academyId: owner.academy.id,
          firstName: "Ana",
          lastName: "Activa",
        },
        {
          academyId: owner.academy.id,
          firstName: "Bea",
          lastName: "Archivada",
          active: false,
        },
      ])
      .returning();

    const archiveResponse = await expectThrownResponse(
      profesorAction({
        request: createPortalPostRequest(
          `http://localhost/portal/profesores/${activeProfessor.id}`,
          owner.cookie,
          formData({ intent: "archive-professor" }),
        ),
        params: { professorId: activeProfessor.id },
      }),
      302,
    );

    expect(archiveResponse.headers.get("location")).toBe(
      `/portal/profesores/${activeProfessor.id}?notificacion=profesor-archivado`,
    );
    await expect(
      db.query.professors.findFirst({
        where: eq(professors.id, activeProfessor.id),
      }),
    ).resolves.toMatchObject({ active: false });

    const baseListData = await profesoresLoader({
      request: new Request("http://localhost/portal/profesores", {
        headers: { cookie: owner.cookie },
      }),
    });
    expect(baseListData.professors).toMatchObject([
      { id: activeProfessor.id, active: false },
      { id: archivedProfessor.id, active: false },
    ]);

    const archivedDetailData = await profesorLoader({
      request: new Request(
        `http://localhost/portal/profesores/${activeProfessor.id}`,
        {
          headers: { cookie: owner.cookie },
        },
      ),
      params: { professorId: activeProfessor.id },
    });
    expect(archivedDetailData.professor).toMatchObject({
      id: activeProfessor.id,
      active: false,
    });

    const reactivateResponse = await expectThrownResponse(
      profesorAction({
        request: createPortalPostRequest(
          `http://localhost/portal/profesores/${activeProfessor.id}`,
          owner.cookie,
          formData({ intent: "reactivate-professor" }),
        ),
        params: { professorId: activeProfessor.id },
      }),
      302,
    );

    expect(reactivateResponse.headers.get("location")).toBe(
      `/portal/profesores/${activeProfessor.id}?notificacion=profesor-reactivado`,
    );
    await expect(
      db.query.professors.findFirst({
        where: eq(professors.id, activeProfessor.id),
      }),
    ).resolves.toMatchObject({ active: true });
  });
});

async function loadPortal(requestUrl: string) {
  return await portalLoader({
    request: await createAcademyRequest(requestUrl),
    params: {},
    context: {},
    url: new URL(requestUrl),
    pattern: "/portal",
  });
}

async function createAcademyRequest(requestUrl: string) {
  const session = await createAcademySession({
    email: "academia@example.com",
    academyName: "Academia de Prueba",
  });

  return new Request(requestUrl, {
    headers: {
      cookie: session.cookie,
    },
  });
}

async function createAcademySession({
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
    academy,
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

function dancerFormData(input: {
  firstName: string;
  lastName: string;
  birthDate: string;
}) {
  const formData = new FormData();
  formData.set("intent", "create-dancer");
  formData.set("firstName", input.firstName);
  formData.set("lastName", input.lastName);
  formData.set("birthDate", input.birthDate);

  return formData;
}

function dancerEditFormData(input: {
  firstName: string;
  lastName: string;
  birthDate: string;
  documentType: string;
  documentNumber: string;
}) {
  const formData = dancerFormData(input);
  formData.set("documentType", input.documentType);
  formData.set("documentNumber", input.documentNumber);

  return formData;
}

function choreographyFormData(input: {
  eventId: string;
  name: string;
  modalityId: string;
  submodalityId: string;
  dancerIds: string[];
  professorIds: string[];
  experienceLevelId: string;
  scheduleEntryId: string;
}) {
  const values = new FormData();

  values.set("intent", "create-choreography");
  values.set("eventId", input.eventId);
  values.set("name", input.name);
  values.set("modalityId", input.modalityId);
  values.set("submodalityId", input.submodalityId);
  values.set("experienceLevelId", input.experienceLevelId);
  values.set("scheduleEntryId", input.scheduleEntryId);

  for (const dancerId of input.dancerIds) {
    values.append("dancerIds", dancerId);
  }

  for (const professorId of input.professorIds) {
    values.append("professorIds", professorId);
  }

  return values;
}

async function createAcademyRecord({
  academyName,
  email,
}: {
  academyName: string;
  email: string;
}) {
  const [record] = await db
    .insert(user)
    .values({
      email,
      name: email,
      emailVerified: true,
      role: "academy",
    })
    .returning();

  const [academy] = await db
    .insert(academies)
    .values({
      userId: record.id,
      name: academyName,
      contactName: "Contacto",
      phone: "11 1234-5678",
    })
    .returning();

  return academy;
}

async function createInternalRequest(requestUrl: string) {
  const signUpResult = await auth.api.signUpEmail({
    body: {
      email: "admin@example.com",
      name: "admin@example.com",
      password: "password-segura",
    },
    returnHeaders: true,
  });

  await db
    .update(user)
    .set({
      emailVerified: true,
      role: "admin",
    })
    .where(eq(user.id, signUpResult.response.user.id));

  return new Request(requestUrl, {
    headers: {
      cookie: createRequestCookie(signUpResult.headers),
    },
  });
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

function createRequestCookie(headers: Headers) {
  const setCookie = headers.get("set-cookie");

  if (!setCookie) {
    throw new Error("Expected Better Auth to return a session cookie.");
  }

  const sessionCookie = setCookie.match(/better-auth\.session_token=([^;]+)/);

  if (!sessionCookie?.[1]) {
    throw new Error("Expected Better Auth to return a session cookie.");
  }

  return `better-auth.session_token=${sessionCookie[1]}`;
}

function formData(values: Record<string, string>) {
  const form = new FormData();

  for (const [key, value] of Object.entries(values)) {
    form.set(key, value);
  }

  return form;
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
