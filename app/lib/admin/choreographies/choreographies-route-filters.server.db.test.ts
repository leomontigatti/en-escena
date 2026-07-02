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

describe("administracion/coreografias route filters", () => {
  test("supports operational filters, event-wide facets, sin-asignar, and invalid URL canonicalization", async () => {
    const event = await createSavedEvent();
    const otherEvent = await createInactiveEvent("Regional 2025");
    const academyNorth = await createAcademyUser({
      email: "academia.norte.filtros@example.com",
      academyName: "Academia Norte",
    });
    const academySouth = await createAcademyUser({
      email: "academia.sur.filtros@example.com",
      academyName: "Academia Sur",
    });
    const jazzCatalog = await createEventCatalog(event.id, "Jazz", {
      categoryName: "Juvenil",
      groupType: "solo",
    });
    const contemporaryCatalog = await createEventCatalog(
      event.id,
      "Contemporáneo",
      {
        categoryName: "Adulto",
        groupType: "duo",
      },
    );
    const urbanCatalog = await createEventCatalog(event.id, "Urbano", {
      categoryName: "Senior",
      groupType: "trio",
    });
    const otherEventCatalog = await createEventCatalog(otherEvent.id, "Tap", {
      categoryName: "Histórico",
      groupType: "grupal",
    });
    const professor = await createProfessor(academyNorth.academy.id);

    await createChoreographyRecord({
      academyId: academyNorth.academy.id,
      categoryId: jazzCatalog.category.id,
      eventId: event.id,
      experienceLevelId: jazzCatalog.level.id,
      groupType: "solo",
      modalityId: jazzCatalog.modality.id,
      musicStorageKey: "music/completa.mp3",
      name: "Completa Jazz",
      professorId: professor.id,
      scheduleCapacityId: jazzCatalog.scheduleCapacity.id,
      submodalityId: jazzCatalog.submodality.id,
    });
    await createChoreographyRecord({
      academyId: academySouth.academy.id,
      categoryId: contemporaryCatalog.category.id,
      eventId: event.id,
      experienceLevelId: contemporaryCatalog.level.id,
      groupType: "duo",
      modalityId: contemporaryCatalog.modality.id,
      name: "Duo Incompleto",
      scheduleCapacityId: contemporaryCatalog.scheduleCapacity.id,
      submodalityId: contemporaryCatalog.submodality.id,
    });
    await createChoreographyRecord({
      academyId: academySouth.academy.id,
      eventId: event.id,
      groupType: "trio",
      modalityId: urbanCatalog.modality.id,
      name: "Sin Categoría Trio",
      scheduleCapacityId: urbanCatalog.scheduleCapacity.id,
      submodalityId: urbanCatalog.submodality.id,
    });
    await createChoreographyRecord({
      academyId: academySouth.academy.id,
      categoryId: otherEventCatalog.category.id,
      eventId: otherEvent.id,
      experienceLevelId: otherEventCatalog.level.id,
      groupType: "grupal",
      modalityId: otherEventCatalog.modality.id,
      name: "Fuera de Evento",
      scheduleCapacityId: otherEventCatalog.scheduleCapacity.id,
      submodalityId: otherEventCatalog.submodality.id,
    });

    const filteredData = await loadRouteData({
      email: "admin.coreografias.filtros@example.com",
      requestUrl:
        `http://localhost/administracion/coreografias?evento=${event.id}` +
        `&estado=incompleta&modalidad=${contemporaryCatalog.modality.id}` +
        `&categoria=${contemporaryCatalog.category.id}&tipo-grupo=duo`,
    });
    const filteredMarkup = renderRoute({
      childLoaderData: filteredData,
      initialEntry:
        `/administracion/coreografias?estado=incompleta&modalidad=${contemporaryCatalog.modality.id}` +
        `&categoria=${contemporaryCatalog.category.id}&tipo-grupo=duo`,
      parentLoaderData: {
        email: "admin.coreografias.filtros@example.com",
        events: [{ id: event.id, name: event.name, active: true }],
        selectedEventId: event.id,
      },
    });

    expect(filteredData.choreographies.map((row) => row.name)).toEqual([
      "Duo Incompleto",
    ]);
    expect(filteredData.facets.modalities).toEqual([
      { label: "Contemporáneo", value: contemporaryCatalog.modality.id },
      { label: "Jazz", value: jazzCatalog.modality.id },
      { label: "Urbano", value: urbanCatalog.modality.id },
    ]);
    expect(filteredData.facets.categories).toEqual([
      { label: "Adulto", value: contemporaryCatalog.category.id },
      { label: "Juvenil", value: jazzCatalog.category.id },
      { label: "Sin asignar", value: "sin-asignar" },
    ]);
    expect(filteredMarkup).toContain(
      'aria-label="Filtros: Estado: Incompleta, Modalidad: Contemporáneo, Categoría: Adulto, Tipo de grupo: Dúo"',
    );
    expect(filteredMarkup).toContain(
      `href="/administracion/coreografias?estado=incompleta&amp;modalidad=${contemporaryCatalog.modality.id}&amp;categoria=${contemporaryCatalog.category.id}&amp;tipo-grupo=duo"`,
    );

    await expectChoreographyNamesForSearch({
      email: "admin.coreografias.filtro-estado@example.com",
      eventId: event.id,
      expectedNames: ["Completa Jazz"],
      search: "&estado=completa",
    });
    await expectChoreographyNamesForSearch({
      email: "admin.coreografias.filtro-modalidad@example.com",
      eventId: event.id,
      expectedNames: ["Sin Categoría Trio"],
      search: `&modalidad=${urbanCatalog.modality.id}`,
    });
    await expectChoreographyNamesForSearch({
      email: "admin.coreografias.filtro-categoria@example.com",
      eventId: event.id,
      expectedNames: ["Completa Jazz"],
      search: `&categoria=${jazzCatalog.category.id}`,
    });
    await expectChoreographyNamesForSearch({
      email: "admin.coreografias.filtro-tipo-grupo@example.com",
      eventId: event.id,
      expectedNames: ["Sin Categoría Trio"],
      search: "&tipo-grupo=trio",
    });

    const missingCategoryData = await loadRouteData({
      email: "admin.coreografias.sin-categoria@example.com",
      requestUrl:
        `http://localhost/administracion/coreografias?evento=${event.id}` +
        "&categoria=sin-asignar",
    });

    expect(missingCategoryData.choreographies.map((row) => row.name)).toEqual([
      "Sin Categoría Trio",
    ]);

    const invalidResponse = await expectThrownResponse(
      loadRouteData({
        email: "admin.coreografias.filtros-invalidos@example.com",
        requestUrl:
          `http://localhost/administracion/coreografias?evento=${event.id}` +
          "&estado=pendiente&modalidad=modalidad_invalida" +
          "&categoria=categoria_invalida&tipo-grupo=pareja&pagina=2",
      }),
      302,
    );

    expect(invalidResponse.headers.get("Location")).toBe(
      `/administracion/coreografias?evento=${event.id}`,
    );
  });
});

async function createSignedInRequest(input: {
  email: string;
  role: "admin";
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

async function createEventCatalog(
  eventId: string,
  modalityName: string,
  options: {
    categoryName: string;
    groupType: "solo" | "duo" | "trio" | "grupal";
  },
) {
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
      groupTypes: [options.groupType],
      maxAge: 17,
      minAge: 13,
      modalityIds: [modality.id],
      name: options.categoryName,
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
      groupType: options.groupType,
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
  groupType: "solo" | "duo" | "trio" | "grupal";
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
      groupType: input.groupType,
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

async function expectChoreographyNamesForSearch(input: {
  email: string;
  eventId: string;
  expectedNames: string[];
  search: string;
}) {
  const data = await loadRouteData({
    email: input.email,
    requestUrl:
      `http://localhost/administracion/coreografias?evento=${input.eventId}` +
      input.search,
  });

  expect(data.choreographies.map((row) => row.name)).toEqual(
    input.expectedNames,
  );
}

async function expectThrownResponse(
  promise: Promise<unknown>,
  expectedStatus: number,
) {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(Response);

    const response = error as Response;

    expect(response.status).toBe(expectedStatus);

    return response;
  }

  throw new Error(`Expected promise to throw a ${expectedStatus} response.`);
}
