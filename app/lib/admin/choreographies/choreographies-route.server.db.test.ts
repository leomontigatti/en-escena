import { eq } from "drizzle-orm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import {
  academies,
  choreographies,
  choreographyProfessors,
  professors,
  user,
} from "@/db/schema";
import { createLocalAccessUser } from "@/lib/auth/access-test-auth.server";
import { createCategory } from "@/lib/categories/repository.server";
import {
  createModality,
  createSubmodality,
} from "@/lib/modalities/repository.server";
import {
  createSchedule,
  createScheduleCapacity,
} from "@/lib/schedules/repository.server";
import { fixedExperienceLevel } from "@/lib/events/bases-test-fixtures.server.db";
import { isExperienceLevel } from "@/lib/events/experience-levels";
import { activateEvent, createEvent } from "@/lib/events/management.server";
import { AdministracionRouteView } from "@/routes/administracion";
import {
  AdministracionCoreografiasRouteView,
  handle,
  loader,
} from "@/routes/administracion.coreografias";

import { installDatabaseTestHooks } from "../../../../tests/db/harness";

installDatabaseTestHooks();

describe("administracion/coreografias route", () => {
  test("allows auditor access and blocks academy and judge users", async () => {
    const event = await createSavedEvent();
    const { request: auditorRequest } = await createSignedInRequest({
      email: "auditor.coreografias@example.com",
      role: "auditor",
      requestUrl: `http://localhost/administracion/coreografias?evento=${event.id}`,
    });

    await expect(loader(routeArgs(auditorRequest))).resolves.toMatchObject({
      selectedEventId: event.id,
    });

    const { request: academyRequest } = await createSignedInRequest({
      email: "academy.coreografias@example.com",
      role: "academy",
      requestUrl: `http://localhost/administracion/coreografias?evento=${event.id}`,
    });
    const { request: judgeRequest } = await createSignedInRequest({
      email: "judge.coreografias@example.com",
      role: "judge",
      requestUrl: `http://localhost/administracion/coreografias?evento=${event.id}`,
    });

    await expectThrownResponse(loader(routeArgs(academyRequest)), 403);
    await expectThrownResponse(loader(routeArgs(judgeRequest)), 403);
  });

  test("renders the active-event choreography operational list with the approved columns and badges", async () => {
    const event = await createSavedEvent();
    const otherEvent = await createInactiveEvent("Regional 2025");
    const archivedAcademy = await createAcademyUser({
      email: "academia.archivada@example.com",
      academyName: "Academia Archivo",
      suspended: true,
    });
    const activeAcademy = await createAcademyUser({
      email: "academia.activa@example.com",
      academyName: "Academia Norte",
    });

    const completeCatalog = await createEventCatalog(event.id, "Jazz");
    const incompleteCatalog = await createEventCatalog(
      event.id,
      "Contemporáneo",
    );
    const otherCatalog = await createEventCatalog(otherEvent.id, "Tap");
    const professor = await createProfessor(archivedAcademy.academy.id);

    await createChoreographyRecord({
      academyId: archivedAcademy.academy.id,
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
      academyId: activeAcademy.academy.id,
      eventId: event.id,
      modalityId: incompleteCatalog.modality.id,
      name: "Bosque Vivo",
      scheduleCapacityId: incompleteCatalog.scheduleCapacity.id,
      submodalityId: incompleteCatalog.submodality.id,
    });

    await createChoreographyRecord({
      academyId: activeAcademy.academy.id,
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
      requestUrl: `http://localhost/administracion/coreografias?evento=${event.id}`,
    });

    const loaderData = await loader(routeArgs(request));
    const markup = renderRoute({
      childLoaderData: loaderData,
      initialEntry: "/administracion/coreografias",
      parentLoaderData: {
        email: "admin.coreografias@example.com",
        events: [{ id: event.id, name: event.name, active: true }],
        selectedEventId: event.id,
      },
    });

    expect(loaderData.selectedEventId).toBe(event.id);
    expect(loaderData.choreographies.map((row) => row.name)).toEqual([
      "Abrazo Final",
      "Bosque Vivo",
    ]);
    expect(markup).toContain("Coreografías");
    expect(markup).toContain(
      "Revisá las coreografías registradas para el evento activo y su estado operativo.",
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
      "Academia",
      "Modalidad / Submodalidad",
      "Categoría / Tipo de grupo",
      "Estado",
    ]) {
      expect(markup).toContain(column);
    }

    expect(markup).toContain("Academia Archivo");
    expect(markup).toContain("Jazz · Lyrical");
    expect(markup).toContain("Juvenil · Solo");
    expect(markup).toContain("Contemporáneo · Lyrical");
    expect(markup).toContain("Sin asignar · Solo");
    expect(markup).toContain("Completa");
    expect(markup).toContain("Incompleta");
    expect(markup).toContain('data-variant="success"');
    expect(markup).toContain('data-variant="warning"');
    expect(markup).not.toContain("/administracion/coreografias/");
    expect(markup).not.toContain("Zeta Histórica");
  });

  test("uses server-side search by choreography and academy name and keeps filtered empties inside the table", async () => {
    const event = await createSavedEvent();
    const academyNorth = await createAcademyUser({
      email: "academia.norte.busqueda@example.com",
      academyName: "Academia Norte",
    });
    const academySouth = await createAcademyUser({
      email: "academia.sur.busqueda@example.com",
      academyName: "Academia Sur",
    });
    const jazzCatalog = await createEventCatalog(event.id, "Jazz");
    const contemporaryCatalog = await createEventCatalog(
      event.id,
      "Contemporáneo",
    );

    await createChoreographyRecord({
      academyId: academyNorth.academy.id,
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
      academyId: academySouth.academy.id,
      categoryId: contemporaryCatalog.category.id,
      eventId: event.id,
      experienceLevelId: contemporaryCatalog.level.id,
      modalityId: contemporaryCatalog.modality.id,
      musicStorageKey: "music/bosque.mp3",
      name: "Bosque Azul",
      scheduleCapacityId: contemporaryCatalog.scheduleCapacity.id,
      submodalityId: contemporaryCatalog.submodality.id,
    });

    const { request: nameRequest } = await createSignedInRequest({
      email: "admin.coreografias.nombre@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/coreografias?evento=${event.id}&busqueda=Luna`,
    });
    const nameData = await loader(routeArgs(nameRequest));
    const nameMarkup = renderRoute({
      childLoaderData: nameData,
      initialEntry: `/administracion/coreografias?busqueda=Luna`,
      parentLoaderData: {
        email: "admin.coreografias.nombre@example.com",
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

    const { request: academyRequest } = await createSignedInRequest({
      email: "admin.coreografias.academia@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/coreografias?evento=${event.id}&busqueda=Academia+Sur`,
    });
    const academyData = await loader(routeArgs(academyRequest));

    expect(academyData.choreographies.map((row) => row.name)).toEqual([
      "Bosque Azul",
    ]);

    const { request: emptyRequest } = await createSignedInRequest({
      email: "admin.coreografias.vacia@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/coreografias?evento=${event.id}&busqueda=Tap`,
    });
    const emptyData = await loader(routeArgs(emptyRequest));
    const emptyMarkup = renderRoute({
      childLoaderData: emptyData,
      initialEntry: `/administracion/coreografias?busqueda=Tap`,
      parentLoaderData: {
        email: "admin.coreografias.vacia@example.com",
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
      "Todavía no hay coreografías para mostrar.",
    );
  });

  test("supports sorting by academia and nombre", async () => {
    const event = await createSavedEvent();
    const academyNorth = await createAcademyUser({
      email: "academia.norte.orden@example.com",
      academyName: "Academia Norte",
    });
    const academySouth = await createAcademyUser({
      email: "academia.sur.orden@example.com",
      academyName: "Academia Sur",
    });
    const jazzCatalog = await createEventCatalog(event.id, "Jazz");

    await createChoreographyRecord({
      academyId: academySouth.academy.id,
      categoryId: jazzCatalog.category.id,
      eventId: event.id,
      experienceLevelId: jazzCatalog.level.id,
      modalityId: jazzCatalog.modality.id,
      name: "Beta",
      scheduleCapacityId: jazzCatalog.scheduleCapacity.id,
      submodalityId: jazzCatalog.submodality.id,
    });
    await createChoreographyRecord({
      academyId: academyNorth.academy.id,
      categoryId: jazzCatalog.category.id,
      eventId: event.id,
      experienceLevelId: jazzCatalog.level.id,
      modalityId: jazzCatalog.modality.id,
      name: "Gamma",
      scheduleCapacityId: jazzCatalog.scheduleCapacity.id,
      submodalityId: jazzCatalog.submodality.id,
    });
    await createChoreographyRecord({
      academyId: academySouth.academy.id,
      categoryId: jazzCatalog.category.id,
      eventId: event.id,
      experienceLevelId: jazzCatalog.level.id,
      modalityId: jazzCatalog.modality.id,
      name: "Alfa",
      scheduleCapacityId: jazzCatalog.scheduleCapacity.id,
      submodalityId: jazzCatalog.submodality.id,
    });

    const baseUrl = `http://localhost/administracion/coreografias?evento=${event.id}`;
    const [defaultData, academyDescData, nameAscData, nameDescData] =
      await Promise.all([
        loadRouteData({
          email: "admin.coreografias.orden.default@example.com",
          requestUrl: baseUrl,
        }),
        loadRouteData({
          email: "admin.coreografias.orden.academia-desc@example.com",
          requestUrl: `${baseUrl}&orden=academia:desc`,
        }),
        loadRouteData({
          email: "admin.coreografias.orden.nombre-asc@example.com",
          requestUrl: `${baseUrl}&orden=nombre:asc`,
        }),
        loadRouteData({
          email: "admin.coreografias.orden.nombre-desc@example.com",
          requestUrl: `${baseUrl}&orden=nombre:desc`,
        }),
      ]);

    expect(defaultData.filters.order).toEqual({
      columnId: "academia",
      direction: "asc",
    });
    expect(getChoreographyOrderLabels(defaultData)).toEqual([
      "Academia Norte:Gamma",
      "Academia Sur:Alfa",
      "Academia Sur:Beta",
    ]);

    expect(getChoreographyOrderLabels(academyDescData)).toEqual([
      "Academia Sur:Alfa",
      "Academia Sur:Beta",
      "Academia Norte:Gamma",
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

    const { request } = await createSignedInRequest({
      email: "admin.coreografias.canonica@example.com",
      role: "admin",
      requestUrl:
        `http://localhost/administracion/coreografias?evento=${event.id}` +
        "&busqueda=Pieza&orden=invalido&pagina=9",
    });

    const response = await expectThrownResponse(
      loader(routeArgs(request)),
      302,
    );

    expect(response.headers.get("Location")).toBe(
      `/administracion/coreografias?evento=${event.id}&busqueda=Pieza&pagina=2`,
    );
  });

  test("removes invalid pagina values and omits pagina for the first page", async () => {
    const event = await createSavedEvent();
    const { request } = await createSignedInRequest({
      email: "admin.coreografias.pagina-invalida@example.com",
      role: "admin",
      requestUrl:
        `http://localhost/administracion/coreografias?evento=${event.id}` +
        "&busqueda=Bosque&pagina=0",
    });

    const response = await expectThrownResponse(
      loader(routeArgs(request)),
      302,
    );

    expect(response.headers.get("Location")).toBe(
      `/administracion/coreografias?evento=${event.id}&busqueda=Bosque`,
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

    const loaderData = await loadRouteData({
      email: "admin.coreografias.urls@example.com",
      requestUrl:
        `http://localhost/administracion/coreografias?evento=${event.id}` +
        "&busqueda=Pieza&orden=nombre:asc&pagina=2",
    });
    const markup = renderRoute({
      childLoaderData: loaderData,
      initialEntry: `/administracion/coreografias?busqueda=Pieza&orden=nombre:asc&pagina=2`,
      parentLoaderData: {
        email: "admin.coreografias.urls@example.com",
        events: [{ id: event.id, name: event.name, active: true }],
        selectedEventId: event.id,
      },
    });

    expect(markup).toContain("busqueda=Pieza&amp;orden=nombre%3Aasc");
    expect(markup).toContain(
      'href="/administracion/coreografias?busqueda=Pieza&amp;orden=nombre%3Aasc"',
    );
    expect(markup).toContain(
      'href="/administracion/coreografias?busqueda=Pieza&amp;orden=nombre%3Aasc&amp;pagina=2"',
    );
    expect(markup).toContain(
      'href="/administracion/coreografias?busqueda=Pieza&amp;orden=nombre%3Aasc"',
    );
    expect(markup).toContain(
      'href="/administracion/coreografias?busqueda=Pieza&amp;orden=academia%3Aasc"',
    );
    expect(markup).toContain(
      'href="/administracion/coreografias?busqueda=Pieza&amp;orden=nombre%3Adesc"',
    );
  });
});

async function createSignedInRequest(input: {
  email: string;
  role: "academy" | "admin" | "auditor" | "judge";
  requestUrl: string;
}) {
  const signUpResult = await createLocalAccessUser({
    email: input.email,
    name: input.email,
    password: "password-segura",
  });

  await db
    .update(user)
    .set({
      emailVerified: true,
      role: input.role,
    })
    .where(eq(user.id, signUpResult.response.user.id));

  return {
    request: new Request(input.requestUrl, {
      headers: {
        cookie: createRequestCookie(signUpResult.headers),
      },
    }),
  };
}

async function loadRouteData(input: { email: string; requestUrl: string }) {
  const { request } = await createSignedInRequest({
    email: input.email,
    role: "admin",
    requestUrl: input.requestUrl,
  });

  return await loader(routeArgs(request));
}

function getChoreographyNames(data: Awaited<ReturnType<typeof loader>>) {
  return data.choreographies.map((row) => row.name);
}

function getChoreographyOrderLabels(data: Awaited<ReturnType<typeof loader>>) {
  return data.choreographies.map((row) => `${row.academyName}:${row.name}`);
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

function createRequestCookie(headers: Headers) {
  const setCookie = headers.get("set-cookie");

  if (!setCookie) {
    throw new Error("Expected access auth to return a session cookie.");
  }

  return setCookie.split(";")[0] ?? "";
}

function routeArgs(request: Request) {
  return {
    request,
    params: {},
    context: {},
    url: new URL(request.url),
    pattern: "/administracion/coreografias",
  };
}

function renderRoute(input: {
  childLoaderData: Awaited<ReturnType<typeof loader>>;
  initialEntry: string;
  parentLoaderData: {
    email: string;
    events: Array<{ active: boolean; id: string; name: string }>;
    selectedEventId: string | null;
  };
}) {
  const RoutesStub = createRoutesStub([
    {
      id: "admin",
      path: "/administracion",
      Component: AdministracionRouteView,
      children: [
        {
          id: "coreografias",
          path: "coreografias",
          Component: AdministracionCoreografiasRouteView,
          handle,
        },
      ],
    },
  ]);

  return renderToStaticMarkup(
    createElement(RoutesStub, {
      initialEntries: [input.initialEntry],
      hydrationData: {
        loaderData: {
          admin: input.parentLoaderData,
          coreografias: input.childLoaderData,
        },
      },
    }),
  );
}

async function createAcademyUser(input: {
  academyName: string;
  email: string;
  suspended?: boolean;
}) {
  const signUpResult = await createLocalAccessUser({
    email: input.email,
    name: input.email,
    password: "password-segura",
  });

  await db
    .update(user)
    .set({
      emailVerified: true,
      role: "academy",
      suspended: input.suspended ?? false,
    })
    .where(eq(user.id, signUpResult.response.user.id));

  const [academy] = await db
    .insert(academies)
    .values({
      userId: signUpResult.response.user.id,
      name: input.academyName,
      contactName: input.academyName,
      phone: "1111-1111",
    })
    .returning();

  return { academy };
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
  const result = await createEvent({
    name: "Regional 2026",
    registrationStartsAt: new Date("2026-03-01T12:00:00Z"),
    registrationEndsAt: new Date("2026-04-30T12:00:00Z"),
    startsAt: new Date("2026-05-01T12:00:00Z"),
    endsAt: new Date("2026-05-03T12:00:00Z"),
  });

  if (!result.ok) {
    throw new Error(result.error);
  }

  await activateEvent(result.event.id);

  return result.event;
}

async function createInactiveEvent(name: string) {
  const result = await createEvent({
    name,
    registrationStartsAt: new Date("2025-03-01T12:00:00Z"),
    registrationEndsAt: new Date("2025-04-30T12:00:00Z"),
    startsAt: new Date("2025-05-01T12:00:00Z"),
    endsAt: new Date("2025-05-03T12:00:00Z"),
  });

  if (!result.ok) {
    throw new Error(result.error);
  }

  return result.event;
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
      experienceLevelIds: [level.id],
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
  categoryId?: string;
  eventId: string;
  experienceLevelId?: string;
  modalityId: string;
  musicStorageKey?: string;
  name: string;
  professorId?: string;
  scheduleCapacityId: string;
  submodalityId?: string;
}) {
  const [choreography] = await db
    .insert(choreographies)
    .values({
      academyId: input.academyId,
      categoryCalculationMode: "oldest",
      categoryId: input.categoryId ?? null,
      eventId: input.eventId,
      experienceLevelId:
        input.experienceLevelId && isExperienceLevel(input.experienceLevelId)
          ? input.experienceLevelId
          : null,
      groupType: "solo",
      modalityId: input.modalityId,
      musicStorageKey: input.musicStorageKey ?? null,
      name: input.name,
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

async function expectThrownResponse(
  resultPromise: Promise<unknown>,
  expectedStatus: number,
) {
  try {
    await resultPromise;
  } catch (error) {
    expect(error).toBeInstanceOf(Response);

    const response = error as Response;

    expect(response.status).toBe(expectedStatus);

    return response;
  }

  throw new Error(`Expected a thrown response with status ${expectedStatus}.`);
}
