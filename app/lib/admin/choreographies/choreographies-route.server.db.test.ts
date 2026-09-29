import { describe, expect, test } from "vitest";

import { db } from "@/db";
import {
  choreographies,
  choreographyProfessors,
  professors,
} from "@/db/schema";
import {
  createSignedInAdminRequest as createSignedInRequest,
  expectThrownResponse,
} from "@/lib/admin/test-support/db";
import { createAcademyUser } from "@/lib/test-support/academies";
import { createCategory } from "@/lib/categories/repository.server";
import {
  createModality,
  createSubmodality,
} from "@/lib/modalities/repository.server";
import {
  createSchedule,
  createScheduleCapacity,
} from "@/lib/schedules/repository.server";
import {
  createEventFixtureDates,
  createSavedEvent as createSavedEventFixture,
  fixedExperienceLevel,
} from "@/lib/events/bases-test-fixtures.server.db";
import { isExperienceLevel } from "@/lib/events/experience-levels";
import { renderAdminChildRoute } from "@/lib/admin/test-support/render-admin-child-route";
import {
  ChoreographiesListRouteView,
  handle,
  loader,
} from "@/routes/administracion.coreografias_.$academyId";
import {
  allocateChoreographyNumberForTest,
  readFixtureCapacityScheduleId,
} from "@/lib/choreographies/registration-test-fixtures.server.db";

import { installDatabaseTestHooks } from "../../../../tests/db/harness";

installDatabaseTestHooks();

describe("`/administracion/coreografias/:academyId` route", () => {
  test("allows auditor access and blocks academy and judge users", async () => {
    const event = await createSavedEvent();
    const academy = await createAcademyUser({
      email: "academia.acceso@example.com",
      academyName: "Academia Acceso",
    });
    const academyId = academy.academy.id;
    const url = academyUrl(academyId);
    const { request: auditorRequest } = await createSignedInRequest({
      email: "auditor.coreografias@example.com",
      role: "auditor",
      requestUrl: url,
    });

    await expect(
      loader(routeArgs(auditorRequest, academyId)),
    ).resolves.toMatchObject({
      selectedEventId: event.id,
    });

    const { request: academyRequest } = await createSignedInRequest({
      email: "academy.coreografias@example.com",
      role: "academy",
      requestUrl: url,
    });
    const { request: judgeRequest } = await createSignedInRequest({
      email: "judge.coreografias@example.com",
      role: "judge",
      requestUrl: url,
    });

    await expectThrownResponse(
      loader(routeArgs(academyRequest, academyId)),
      403,
    );
    await expectThrownResponse(loader(routeArgs(judgeRequest, academyId)), 403);
  });

  test("responds 404 for an unknown academy", async () => {
    await createSavedEvent();
    const unknownId = "00000000-0000-4000-8000-000000000000";
    const { request } = await createSignedInRequest({
      email: "admin.coreografias.desconocida@example.com",
      role: "admin",
      requestUrl: academyUrl(unknownId),
    });

    await expectThrownResponse(loader(routeArgs(request, unknownId)), 404);
  });

  test("renders one academy's active-event choreography list with the approved columns and badges", async () => {
    const event = await createSavedEvent();
    const otherEvent = await createInactiveEvent("Regional 2025");
    const otherAcademy = await createAcademyUser({
      email: "academia.otra@example.com",
      academyName: "Academia Otra",
    });
    const activeAcademy = await createAcademyUser({
      email: "academia.activa@example.com",
      academyName: "Academia Norte",
    });
    const academyId = activeAcademy.academy.id;

    const completeCatalog = await createEventCatalog(event.id, "Jazz");
    const incompleteCatalog = await createEventCatalog(
      event.id,
      "Contemporáneo",
    );
    const otherCatalog = await createEventCatalog(otherEvent.id, "Tap");
    const professor = await createProfessor(academyId);

    await createChoreographyRecord({
      academyId,
      categoryId: completeCatalog.category.id,
      eventId: event.id,
      experienceLevelId: completeCatalog.level.id,
      modalityId: completeCatalog.modality.id,
      musicStorageKey: "music/archivo.mp3",
      name: "Abrazo Final",
      professorId: professor.id,
      scheduleCapacityId: completeCatalog.scheduleCapacity.id,
      submodalityId: completeCatalog.submodality.id,
    });

    await createChoreographyRecord({
      academyId,
      categoryId: incompleteCatalog.category.id,
      eventId: event.id,
      modalityId: incompleteCatalog.modality.id,
      name: "Bosque Vivo",
      scheduleCapacityId: incompleteCatalog.scheduleCapacity.id,
      submodalityId: incompleteCatalog.submodality.id,
    });

    await createChoreographyRecord({
      academyId: otherAcademy.academy.id,
      categoryId: completeCatalog.category.id,
      eventId: event.id,
      experienceLevelId: completeCatalog.level.id,
      modalityId: completeCatalog.modality.id,
      name: "Ajena Otra Academia",
      scheduleCapacityId: completeCatalog.scheduleCapacity.id,
      submodalityId: completeCatalog.submodality.id,
    });

    await createChoreographyRecord({
      academyId,
      categoryId: otherCatalog.category.id,
      eventId: otherEvent.id,
      experienceLevelId: otherCatalog.level.id,
      modalityId: otherCatalog.modality.id,
      musicStorageKey: "music/otro-evento.mp3",
      name: "Zeta Histórica",
      scheduleCapacityId: otherCatalog.scheduleCapacity.id,
      submodalityId: otherCatalog.submodality.id,
    });

    const { request } = await createSignedInRequest({
      email: "admin.coreografias@example.com",
      role: "admin",
      requestUrl: academyUrl(academyId),
    });

    const loaderData = await loader(routeArgs(request, academyId));
    const markup = renderRoute({
      childLoaderData: loaderData,
      initialEntry: `/administracion/coreografias/${academyId}`,
      parentLoaderData: {
        events: [{ id: event.id, name: event.name, active: true }],
        selectedEventId: event.id,
      },
    });

    expect(loaderData.selectedEventId).toBe(event.id);
    expect(loaderData.academy).toEqual({
      id: academyId,
      name: "Academia Norte",
    });
    expect(loaderData.choreographies.map((row) => row.name)).toEqual([
      "Abrazo Final",
      "Bosque Vivo",
    ]);
    expect(markup).toContain("Academia Norte");
    expect(markup).toContain(
      "Revisá las coreografías que la academia registró para el evento activo y su estado operativo.",
    );
    expect(markup).toContain('href="/administracion/coreografias"');
    expect(markup.indexOf("Eventos")).toBeLessThan(
      markup.indexOf("Coreografías"),
    );
    expect(markup.indexOf("Coreografías")).toBeLessThan(
      markup.indexOf("Profesores"),
    );

    for (const column of [
      "Nombre",
      "Modalidad / Submodalidad",
      "Categoría / Tipo de grupo",
      "Estado",
    ]) {
      expect(markup).toContain(column);
    }

    expect(markup).not.toContain("Academia Otra");
    expect(markup).toContain("Jazz · Lyrical");
    expect(markup).toContain("Juvenil · Solo");
    expect(markup).toContain("Contemporáneo · Lyrical");
    expect(markup).toContain("Completa");
    expect(markup).toContain("Incompleta");
    expect(markup).toContain('data-variant="success"');
    expect(markup).toContain('data-variant="warning"');
    expect(markup).toContain(
      `href="/administracion/coreografias/${academyId}/${loaderData.choreographies[0]?.id}"`,
    );
    expect(markup).toContain(
      `href="/administracion/coreografias/${academyId}/${loaderData.choreographies[1]?.id}"`,
    );
    expect(markup).not.toContain("Zeta Histórica");
    expect(markup).not.toContain("Ajena Otra Academia");
  });

  test("shows the academy empty state when it has no choreographies in the event", async () => {
    const event = await createSavedEvent();
    const academy = await createAcademyUser({
      email: "academia.vacia@example.com",
      academyName: "Academia Vacía",
    });
    const academyId = academy.academy.id;
    const loaderData = await loadRouteData({
      academyId,
      email: "admin.coreografias.academia-vacia@example.com",
      requestUrl: academyUrl(academyId),
    });
    const markup = renderRoute({
      childLoaderData: loaderData,
      initialEntry: `/administracion/coreografias/${academyId}`,
      parentLoaderData: {
        events: [{ id: event.id, name: event.name, active: true }],
        selectedEventId: event.id,
      },
    });

    expect(loaderData.hasAnyChoreography).toBe(false);
    expect(markup).toContain(
      "Esta academia no tiene coreografías en este evento",
    );
  });

  test("uses server-side search by choreography name or number and keeps filtered empties inside the table", async () => {
    const event = await createSavedEvent();
    const academyNorth = await createAcademyUser({
      email: "academia.norte.busqueda@example.com",
      academyName: "Academia Norte",
    });
    const academySouth = await createAcademyUser({
      email: "academia.sur.busqueda@example.com",
      academyName: "Academia Sur",
    });
    const academyId = academyNorth.academy.id;
    const jazzCatalog = await createEventCatalog(event.id, "Jazz");
    const contemporaryCatalog = await createEventCatalog(
      event.id,
      "Contemporáneo",
    );

    await createChoreographyRecord({
      academyId,
      categoryId: jazzCatalog.category.id,
      eventId: event.id,
      experienceLevelId: jazzCatalog.level.id,
      modalityId: jazzCatalog.modality.id,
      musicStorageKey: "music/luna.mp3",
      name: "Luna Roja",
      scheduleCapacityId: jazzCatalog.scheduleCapacity.id,
      submodalityId: jazzCatalog.submodality.id,
    });

    await createChoreographyRecord({
      academyId,
      categoryId: contemporaryCatalog.category.id,
      eventId: event.id,
      experienceLevelId: contemporaryCatalog.level.id,
      modalityId: contemporaryCatalog.modality.id,
      musicStorageKey: "music/bosque.mp3",
      name: "Bosque Azul",
      scheduleCapacityId: contemporaryCatalog.scheduleCapacity.id,
      submodalityId: contemporaryCatalog.submodality.id,
    });

    // Another academy's choreography matches the same search term but must
    // never appear in this academy's list.
    await createChoreographyRecord({
      academyId: academySouth.academy.id,
      categoryId: jazzCatalog.category.id,
      eventId: event.id,
      experienceLevelId: jazzCatalog.level.id,
      modalityId: jazzCatalog.modality.id,
      name: "Luna Ajena",
      scheduleCapacityId: jazzCatalog.scheduleCapacity.id,
      submodalityId: jazzCatalog.submodality.id,
    });

    const nameUrl = academyUrl(academyId, "?busqueda=Luna");
    const nameData = await loadRouteData({
      academyId,
      email: "admin.coreografias.nombre@example.com",
      requestUrl: nameUrl,
    });
    const nameMarkup = renderRoute({
      childLoaderData: nameData,
      initialEntry: `/administracion/coreografias/${academyId}?busqueda=Luna`,
      parentLoaderData: {
        events: [{ id: event.id, name: event.name, active: true }],
        selectedEventId: event.id,
      },
    });

    expect(nameData.filters.query).toBe("Luna");
    expect(nameData.choreographies.map((row) => row.name)).toEqual([
      "Luna Roja",
    ]);
    expect(nameMarkup).toContain('value="Luna"');
    expect(nameMarkup).toContain("busqueda=Luna");
    expect(nameMarkup).toContain("Buscar por número o nombre");

    // The academy name is not searchable any more: the academy is the page.
    const academyNameData = await loadRouteData({
      academyId,
      email: "admin.coreografias.academia@example.com",
      requestUrl: academyUrl(academyId, "?busqueda=Academia+Norte"),
    });

    expect(academyNameData.choreographies).toHaveLength(0);

    const emptyData = await loadRouteData({
      academyId,
      email: "admin.coreografias.vacia@example.com",
      requestUrl: academyUrl(academyId, "?busqueda=Tap"),
    });
    const emptyMarkup = renderRoute({
      childLoaderData: emptyData,
      initialEntry: `/administracion/coreografias/${academyId}?busqueda=Tap`,
      parentLoaderData: {
        events: [{ id: event.id, name: event.name, active: true }],
        selectedEventId: event.id,
      },
    });

    expect(emptyData.hasAnyChoreography).toBe(true);
    expect(emptyData.choreographies).toHaveLength(0);
    expect(emptyMarkup).toContain('value="Tap"');
    expect(emptyMarkup).toContain(
      "No hay coreografías que coincidan con la búsqueda o los filtros.",
    );
    expect(emptyMarkup).not.toContain(
      "Esta academia no tiene coreografías en este evento",
    );
  });

  test("sorts by number by default and supports name", async () => {
    const event = await createSavedEvent();
    const academy = await createAcademyUser({
      email: "academia.norte.orden@example.com",
      academyName: "Academia Norte",
    });
    const otherAcademy = await createAcademyUser({
      email: "academia.sur.orden@example.com",
      academyName: "Academia Sur",
    });
    const academyId = academy.academy.id;
    const jazzCatalog = await createEventCatalog(event.id, "Jazz");

    for (const [ownerId, name] of [
      [academyId, "Beta"],
      [otherAcademy.academy.id, "Ajena"],
      [academyId, "Gamma"],
      [academyId, "Alfa"],
    ] as const) {
      await createChoreographyRecord({
        academyId: ownerId,
        categoryId: jazzCatalog.category.id,
        eventId: event.id,
        experienceLevelId: jazzCatalog.level.id,
        modalityId: jazzCatalog.modality.id,
        name,
        scheduleCapacityId: jazzCatalog.scheduleCapacity.id,
        submodalityId: jazzCatalog.submodality.id,
      });
    }

    const [defaultData, numberDescData, nameAscData, nameDescData] =
      await Promise.all([
        loadRouteData({
          academyId,
          email: "admin.coreografias.orden.default@example.com",
          requestUrl: academyUrl(academyId),
        }),
        loadRouteData({
          academyId,
          email: "admin.coreografias.orden.numero-desc@example.com",
          requestUrl: academyUrl(academyId, "?orden=numero:desc"),
        }),
        loadRouteData({
          academyId,
          email: "admin.coreografias.orden.nombre-asc@example.com",
          requestUrl: academyUrl(academyId, "?orden=nombre:asc"),
        }),
        loadRouteData({
          academyId,
          email: "admin.coreografias.orden.nombre-desc@example.com",
          requestUrl: academyUrl(academyId, "?orden=nombre:desc"),
        }),
      ]);

    // The academy's three were created as Beta, Gamma, Alfa, so they carry
    // numbers in an order that matches neither the names nor their reverse.
    // The other academy's choreography never shows up.
    expect(defaultData.filters.order).toEqual({
      columnId: "numero",
      direction: "asc",
    });
    expect(getChoreographyNames(defaultData)).toEqual([
      "Beta",
      "Gamma",
      "Alfa",
    ]);
    expect(getChoreographyNames(numberDescData)).toEqual([
      "Alfa",
      "Gamma",
      "Beta",
    ]);
    expect(getChoreographyNames(nameAscData)).toEqual([
      "Alfa",
      "Beta",
      "Gamma",
    ]);
    expect(getChoreographyNames(nameDescData)).toEqual([
      "Gamma",
      "Beta",
      "Alfa",
    ]);
  });

  test("redirects the removed academy sort to the canonical URL", async () => {
    const event = await createSavedEvent();
    const academy = await createAcademyUser({
      email: "academia.orden-removido@example.com",
      academyName: "Academia Orden",
    });
    const catalog = await createEventCatalog(event.id, "Jazz");

    await createChoreographyRecord({
      academyId: academy.academy.id,
      categoryId: catalog.category.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      name: "Unica",
      scheduleCapacityId: catalog.scheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });

    const response = await expectThrownResponse(
      loadRouteData({
        academyId: academy.academy.id,
        email: "admin.coreografias.orden-academia@example.com",
        requestUrl: academyUrl(academy.academy.id, "?orden=academia:asc"),
      }),
      302,
    );

    expect(response.headers.get("Location")).toBe(
      `/administracion/coreografias/${academy.academy.id}`,
    );
  });

  test("redirects invalid sort and out-of-range pagination to the canonical URL", async () => {
    const event = await createSavedEvent();
    const academy = await createAcademyUser({
      email: "academia.canonica@example.com",
      academyName: "Academia Canonica",
    });
    const catalog = await createEventCatalog(event.id, "Jazz");

    await createChoreographyPageRecords({
      academyId: academy.academy.id,
      catalog,
      eventId: event.id,
    });

    const academyId = academy.academy.id;
    const { request } = await createSignedInRequest({
      email: "admin.coreografias.canonica@example.com",
      role: "admin",
      requestUrl: academyUrl(
        academyId,
        "?busqueda=Pieza&orden=invalido&pagina=9",
      ),
    });

    const response = await expectThrownResponse(
      loader(routeArgs(request, academyId)),
      302,
    );

    expect(response.headers.get("Location")).toBe(
      `/administracion/coreografias/${academyId}?busqueda=Pieza&pagina=2`,
    );
  });

  test("removes invalid pagina values and omits pagina for the first page", async () => {
    await createSavedEvent();
    const academy = await createAcademyUser({
      email: "academia.pagina-invalida@example.com",
      academyName: "Academia Pagina",
    });
    const academyId = academy.academy.id;
    const { request } = await createSignedInRequest({
      email: "admin.coreografias.pagina-invalida@example.com",
      role: "admin",
      requestUrl: academyUrl(academyId, "?busqueda=Bosque&pagina=0"),
    });

    const response = await expectThrownResponse(
      loader(routeArgs(request, academyId)),
      302,
    );

    expect(response.headers.get("Location")).toBe(
      `/administracion/coreografias/${academyId}?busqueda=Bosque`,
    );
  });

  test("preserves busqueda when changing page or sort and resets pagina on sort links", async () => {
    const event = await createSavedEvent();
    const academy = await createAcademyUser({
      email: "academia.urls@example.com",
      academyName: "Academia URL",
    });
    const catalog = await createEventCatalog(event.id, "Jazz");

    await createChoreographyPageRecords({
      academyId: academy.academy.id,
      catalog,
      eventId: event.id,
    });

    const academyId = academy.academy.id;
    const base = `/administracion/coreografias/${academyId}`;
    const loaderData = await loadRouteData({
      academyId,
      email: "admin.coreografias.urls@example.com",
      requestUrl: academyUrl(
        academyId,
        "?busqueda=Pieza&orden=nombre:asc&pagina=2",
      ),
    });
    const markup = renderRoute({
      childLoaderData: loaderData,
      initialEntry: `${base}?busqueda=Pieza&orden=nombre:asc&pagina=2`,
      parentLoaderData: {
        events: [{ id: event.id, name: event.name, active: true }],
        selectedEventId: event.id,
      },
    });

    expect(markup).toContain("busqueda=Pieza&amp;orden=nombre%3Aasc");
    expect(markup).toContain(
      `href="${base}?busqueda=Pieza&amp;orden=nombre%3Aasc"`,
    );
    expect(markup).toContain(
      `href="${base}?busqueda=Pieza&amp;orden=nombre%3Aasc&amp;pagina=2"`,
    );
    expect(markup).toContain(
      `href="${base}?busqueda=Pieza&amp;orden=nombre%3Adesc"`,
    );
    expect(markup).not.toContain("orden=academia");
  });
});

function academyUrl(academyId: string, search = "") {
  return `http://localhost/administracion/coreografias/${academyId}${search}`;
}

async function loadRouteData(input: {
  academyId: string;
  email: string;
  requestUrl: string;
}) {
  const { request } = await createSignedInRequest({
    email: input.email,
    role: "admin",
    requestUrl: input.requestUrl,
  });

  return await loader(routeArgs(request, input.academyId));
}

function getChoreographyNames(data: Awaited<ReturnType<typeof loader>>) {
  return data.choreographies.map((row) => row.name);
}

async function createChoreographyPageRecords(input: {
  academyId: string;
  catalog: Awaited<ReturnType<typeof createEventCatalog>>;
  eventId: string;
}) {
  for (let index = 0; index < 51; index += 1) {
    await createChoreographyRecord({
      academyId: input.academyId,
      categoryId: input.catalog.category.id,
      eventId: input.eventId,
      experienceLevelId: input.catalog.level.id,
      modalityId: input.catalog.modality.id,
      name: `Pieza ${String(index + 1).padStart(2, "0")}`,
      scheduleCapacityId: input.catalog.scheduleCapacity.id,
      submodalityId: input.catalog.submodality.id,
    });
  }
}

function routeArgs(request: Request, academyId: string) {
  return {
    request,
    params: { academyId },
    context: {},
    url: new URL(request.url),
    pattern: "/administracion/coreografias/:academyId",
  };
}

function renderRoute(input: {
  childLoaderData: Awaited<ReturnType<typeof loader>>;
  initialEntry: string;
  parentLoaderData: {
    events: Array<{ active: boolean; id: string; name: string }>;
    selectedEventId: string | null;
  };
}) {
  return renderAdminChildRoute({
    childComponent: ChoreographiesListRouteView,
    childHandle: handle,
    childId: "coreografias",
    childLoaderData: input.childLoaderData,
    childPath: "coreografias/:academyId",
    initialEntry: input.initialEntry,
    parentLoaderData: input.parentLoaderData,
  });
}

async function createProfessor(academyId: string) {
  const [professor] = await db
    .insert(professors)
    .values({
      academyId,
      firstName: "Luz",
      lastName: "Suárez",
      active: true,
    })
    .returning();

  return professor;
}

async function createSavedEvent() {
  return createSavedEventFixture("Regional 2026", {
    activate: true,
    dates: createEventFixtureDates(2026),
  });
}

async function createInactiveEvent(name: string) {
  return createSavedEventFixture(name, {
    dates: createEventFixtureDates(2025),
  });
}

async function createEventCatalog(eventId: string, modalityName: string) {
  const modality = await expectCreated(
    createModality(eventId, { name: modalityName }),
  );
  const submodality = await expectCreated(
    createSubmodality(eventId, {
      modalityId: modality.id,
      name: "Lyrical",
    }),
  );
  const level = fixedExperienceLevel(eventId);
  const category = await expectCreated(
    createCategory(eventId, {
      experienceLevels: [level.id],
      groupTypes: ["solo"],
      maxAge: 17,
      minAge: 13,
      modalityIds: [modality.id],
      name: "Juvenil",
    }),
  );
  const schedule = await expectCreated(
    createSchedule(eventId, {
      modalityIds: [modality.id],
      name: `${modalityName} Bloque`,
      scheduledDate: "2026-05-01",
      startTime: "10:00",
      totalCapacity: 20,
    }),
  );
  const scheduleCapacity = await expectCreated(
    createScheduleCapacity(schedule.id, {
      groupType: "solo",
      capacity: 20,
    }),
  );

  return {
    category,
    level,
    modality,
    scheduleCapacity,
    submodality,
  };
}

async function createChoreographyRecord(input: {
  academyId: string;
  categoryId: string;
  eventId: string;
  experienceLevelId?: string;
  modalityId: string;
  musicStorageKey?: string;
  name: string;
  professorId?: string;
  scheduleCapacityId: string;
  submodalityId?: string;
}) {
  const choreographyNumber = await allocateChoreographyNumberForTest(
    input.eventId,
  );
  const [choreography] = await db
    .insert(choreographies)
    .values({
      choreographyNumber,
      academyId: input.academyId,
      categoryCalculationMode: "oldest",
      categoryId: input.categoryId,
      eventId: input.eventId,
      experienceLevelId:
        input.experienceLevelId && isExperienceLevel(input.experienceLevelId)
          ? input.experienceLevelId
          : null,
      groupType: "solo",
      modalityId: input.modalityId,
      musicStorageKey: input.musicStorageKey ?? null,
      name: input.name,
      scheduleId: await readFixtureCapacityScheduleId(input.scheduleCapacityId),
      scheduleCapacityId: input.scheduleCapacityId,
      submodalityId: input.submodalityId ?? null,
    })
    .returning();

  if (input.professorId) {
    await db.insert(choreographyProfessors).values({
      choreographyId: choreography.id,
      professorId: input.professorId,
    });
  }

  return choreography;
}

async function expectCreated<T extends { id: string }>(
  resultPromise: Promise<
    { ok: true; record: T } | { ok: false; error?: string }
  >,
) {
  const result = await resultPromise;

  if (!result.ok) {
    throw new Error(result.error ?? "Expected helper result to be ok.");
  }

  return result.record;
}
