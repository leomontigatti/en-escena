import { eq } from "drizzle-orm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import {
  academies,
  choreographyDancers,
  choreographies,
  dancers,
  user,
} from "@/db/schema";
import {
  createModality,
  createScheduleBlock,
  createScheduleEntry,
} from "@/lib/admin-catalogs.server";
import { auth } from "@/lib/auth.server";
import { createEvent } from "@/lib/event-management.server";
import {
  AdministracionBailarinesRouteView,
  loader,
} from "@/routes/administracion_.bailarines";
import {
  AdministracionBailarinDetalleRouteView,
  loader as detailLoader,
} from "@/routes/administracion_.bailarines_.$dancerId";

import { installDatabaseTestHooks } from "../../tests/db/harness";

installDatabaseTestHooks();

describe("administracion/bailarines route", () => {
  test("allows admin access and renders an empty readonly Bailarines list", async () => {
    const { request } = await createSignedInRequest({
      email: "admin.bailarines@example.com",
      role: "admin",
      requestUrl: "http://localhost/administracion/bailarines",
    });

    const loaderData = await loader(routeArgs(request));
    const markup = renderRoute(loaderData);

    expect(loaderData.email).toBe("admin.bailarines@example.com");
    expect(markup).toContain("Bailarines");
    expect(markup).toContain("Todavía no hay Bailarines para mostrar.");
    expect(markup).not.toContain("Acciones");
  });

  test("allows auditor access and blocks academy and judge users", async () => {
    const event = await createSavedEvent();
    const academy = await createAcademyUser({
      email: "academia.detail.access@example.com",
      academyName: "Academia Acceso",
      contactName: "Alicia Acceso",
      phone: "5555-5555",
    });
    const dancer = await createDancer({
      academyId: academy.academy.id,
      firstName: "Dana",
      lastName: "Acceso",
      birthDate: "2013-09-09",
    });
    const { request: auditorRequest } = await createSignedInRequest({
      email: "auditor.bailarines@example.com",
      role: "auditor",
      requestUrl: `http://localhost/administracion/bailarines?evento=${event.id}`,
    });

    await expect(loader(routeArgs(auditorRequest))).resolves.toMatchObject({
      email: "auditor.bailarines@example.com",
    });

    const { request: academyRequest } = await createSignedInRequest({
      email: "academy.bailarines@example.com",
      role: "academy",
      requestUrl: `http://localhost/administracion/bailarines?evento=${event.id}`,
    });
    const { request: judgeRequest } = await createSignedInRequest({
      email: "judge.bailarines@example.com",
      role: "judge",
      requestUrl: `http://localhost/administracion/bailarines?evento=${event.id}`,
    });

    await expectThrownResponse(loader(routeArgs(academyRequest)), 403);
    await expectThrownResponse(loader(routeArgs(judgeRequest)), 403);
    await expectThrownResponse(
      detailLoader(detailRouteArgs(academyRequest, dancer.id)),
      403,
    );
    await expectThrownResponse(
      detailLoader(detailRouteArgs(judgeRequest, dancer.id)),
      403,
    );
  });

  test("filters by participation, identification, and search, paginates server-side, and renders readonly badges", async () => {
    const event = await createSavedEvent();
    const northAcademy = await createAcademyUser({
      email: "academia.dancers.norte@example.com",
      academyName: "Academia Norte",
      contactName: "Luz Norte",
      phone: "1111-1111",
    });
    const southAcademy = await createAcademyUser({
      email: "academia.dancers.sur@example.com",
      academyName: "Academia Sur",
      contactName: "Nora Sur",
      phone: "2222-2222",
    });
    const participatingDancer = await createDancer({
      academyId: northAcademy.academy.id,
      firstName: "Ana",
      lastName: "Participa",
      birthDate: "2012-01-10",
    });
    const identifiedDancer = await createDancer({
      academyId: southAcademy.academy.id,
      firstName: "Bruno",
      lastName: "Documento",
      birthDate: "2011-02-20",
      documentType: "dni",
      documentNumber: "2002",
    });
    const archivedDancer = await createDancer({
      academyId: northAcademy.academy.id,
      firstName: "Carla",
      lastName: "Archivada",
      birthDate: "2010-03-30",
      active: false,
      documentType: "passport",
      documentNumber: "AA3003",
    });

    await linkDancerToEventChoreography({
      eventId: event.id,
      academyId: northAcademy.academy.id,
      dancerId: participatingDancer.id,
      choreographyName: "Amanecer",
    });
    await linkDancerToEventChoreography({
      eventId: event.id,
      academyId: northAcademy.academy.id,
      dancerId: archivedDancer.id,
      choreographyName: "Noche",
    });

    for (let index = 0; index < 51; index += 1) {
      await createDancer({
        academyId: northAcademy.academy.id,
        firstName: `Extra ${index + 1}`,
        lastName: "Fila",
        birthDate: "2014-04-15",
      });
    }

    const { request: defaultRequest } = await createSignedInRequest({
      email: "admin.default.dancers@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/bailarines?evento=${event.id}&identificacion=todos`,
    });
    const defaultData = await loader(routeArgs(defaultRequest));

    expect(defaultData.filters.participation).toBe("yes");
    expect(defaultData.dancers.map((dancer) => dancer.id)).toEqual([
      participatingDancer.id,
    ]);

    const { request: searchRequest } = await createSignedInRequest({
      email: "admin.search.dancers@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/bailarines?evento=${event.id}&participando=todos&estado=todos&identificacion=sin-imagenes&q=Academia+Sur`,
    });
    const searchData = await loader(routeArgs(searchRequest));
    const searchMarkup = renderRoute(searchData);

    expect(searchData.dancers.map((dancer) => dancer.id)).toEqual([
      identifiedDancer.id,
    ]);
    expect(searchMarkup).toContain("No participando");
    expect(searchMarkup).toContain("Activo");
    expect(searchMarkup).toContain("Sin imágenes");
    expect(searchMarkup).not.toContain("Acciones");
    expect(searchMarkup).toContain(
      `/administracion/bailarines/${identifiedDancer.id}?evento=${event.id}`,
    );
    expect(searchMarkup).toContain("participando=todos");
    expect(searchMarkup).toContain("estado=todos");
    expect(searchMarkup).toContain("identificacion=sin-imagenes");
    expect(searchMarkup).toContain("q=Academia+Sur");

    const { request: archivedRequest } = await createSignedInRequest({
      email: "admin.archived.dancers@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/bailarines?evento=${event.id}&estado=archivados&identificacion=todos`,
    });
    const archivedData = await loader(routeArgs(archivedRequest));
    const archivedMarkup = renderRoute(archivedData);

    expect(archivedData.dancers.map((dancer) => dancer.id)).toEqual([
      archivedDancer.id,
    ]);
    expect(archivedMarkup).toContain("Archivado");
    expect(archivedMarkup).toContain("Participando");

    const { request: pageTwoRequest } = await createSignedInRequest({
      email: "admin.pagination.dancers@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/bailarines?evento=${event.id}&participando=todos&identificacion=todos&page=2`,
    });
    const pageTwoData = await loader(routeArgs(pageTwoRequest));
    const pageTwoMarkup = renderRoute(pageTwoData);

    expect(pageTwoData.totalCount).toBe(53);
    expect(pageTwoData.dancers).toHaveLength(3);
    expect(pageTwoData.filters.page).toBe(2);
    expect(pageTwoMarkup).toContain("53 resultados");
    expect(pageTwoMarkup).toContain("Página 2 de 2");
    expect(pageTwoMarkup).toContain("Página anterior");
  });

  test("shows Sin evento badges when there is no Evento de trabajo", async () => {
    const academy = await createAcademyUser({
      email: "sin.evento.dancers@example.com",
      academyName: "Academia Base",
      contactName: "Ceci Base",
      phone: "3333-3333",
    });
    const dancer = await createDancer({
      academyId: academy.academy.id,
      firstName: "Diego",
      lastName: "Base",
      birthDate: "2015-05-05",
    });
    const { request } = await createSignedInRequest({
      email: "admin.no-event.dancers@example.com",
      role: "admin",
      requestUrl:
        "http://localhost/administracion/bailarines?identificacion=todos",
    });

    const loaderData = await loader(routeArgs(request));
    const markup = renderRoute(loaderData);

    expect(loaderData.selectedEventId).toBeNull();
    expect(loaderData.filters.participation).toBe("all");
    expect(loaderData.dancers.map((item) => item.id)).toEqual([dancer.id]);
    expect(markup).toContain("Sin evento");
  });

  test("renders a readonly Bailarín ficha with academy contact and participation data", async () => {
    const event = await createSavedEvent();
    const academy = await createAcademyUser({
      email: "ficha.dancer.academia@example.com",
      academyName: "Academia Ficha",
      contactName: "Elena Ficha",
      phone: "4444-4444",
    });
    const dancer = await createDancer({
      academyId: academy.academy.id,
      firstName: "Julia",
      lastName: "Detalle",
      birthDate: "2012-07-12",
      documentType: "passport",
      documentNumber: "AA123456",
      createdAt: new Date("2026-01-10T12:00:00Z"),
      updatedAt: new Date("2026-06-05T15:30:00Z"),
    });

    await linkDancerToEventChoreography({
      eventId: event.id,
      academyId: academy.academy.id,
      dancerId: dancer.id,
      choreographyName: "Raíz",
    });

    const { request } = await createSignedInRequest({
      email: "auditor.detail.dancers@example.com",
      role: "auditor",
      requestUrl: `http://localhost/administracion/bailarines/${dancer.id}?evento=${event.id}&estado=todos&participando=todos&identificacion=todos&page=2&q=Julia`,
    });

    const loaderData = await detailLoader(detailRouteArgs(request, dancer.id));
    const markup = renderDetailRoute(loaderData, dancer.id);

    expect(markup).toContain("Academia Ficha");
    expect(markup).toContain("Elena Ficha");
    expect(markup).toContain("ficha.dancer.academia@example.com");
    expect(markup).toContain("4444-4444");
    expect(markup).toContain("12/07/2012");
    expect(markup).toContain("Pasaporte AA123456");
    expect(markup).toContain("Sin imágenes");
    expect(markup).toContain("Participando en el Evento de trabajo.");
    expect(markup).toContain("Raíz");
    expect(markup).toContain(`/administracion/bailarines?evento=${event.id}`);
    expect(markup).toContain("estado=todos");
    expect(markup).toContain("participando=todos");
    expect(markup).toContain("identificacion=todos");
    expect(markup).toContain("page=2");
    expect(markup).toContain("q=Julia");
    expect(markup).not.toContain("Editar");
    expect(markup).not.toContain("Archivar Bailarín");
  });
});

function renderRoute(
  loaderData: Parameters<
    typeof AdministracionBailarinesRouteView
  >[0]["loaderData"],
) {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      {
        initialEntries: ["/administracion/bailarines"],
      },
      createElement(AdministracionBailarinesRouteView, { loaderData }),
    ),
  );
}

function renderDetailRoute(
  loaderData: Parameters<
    typeof AdministracionBailarinDetalleRouteView
  >[0]["loaderData"],
  dancerId: string,
) {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      {
        initialEntries: [`/administracion/bailarines/${dancerId}`],
      },
      createElement(AdministracionBailarinDetalleRouteView, { loaderData }),
    ),
  );
}

async function createSignedInRequest(input: {
  email: string;
  role: "academy" | "admin" | "auditor" | "judge";
  requestUrl: string;
}) {
  const signUpResult = await auth.api.signUpEmail({
    body: {
      email: input.email,
      name: input.email,
      password: "password-segura",
    },
    returnHeaders: true,
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

function createRequestCookie(headers: Headers) {
  return headers.get("set-cookie") ?? "";
}

function routeArgs(request: Request) {
  return {
    request,
    params: {},
    context: {},
    url: new URL(request.url),
    pattern: "/administracion/bailarines",
  };
}

function detailRouteArgs(request: Request, dancerId: string) {
  return {
    request,
    params: { dancerId },
    context: {},
    url: new URL(request.url),
    pattern: "/administracion/bailarines/:dancerId",
  };
}

async function createAcademyUser(input: {
  email: string;
  academyName: string;
  contactName: string;
  phone: string;
}) {
  const signUpResult = await auth.api.signUpEmail({
    body: {
      email: input.email,
      name: input.email,
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
      name: input.academyName,
      contactName: input.contactName,
      phone: input.phone,
    })
    .returning();

  return {
    academy,
    userId: signUpResult.response.user.id,
  };
}

async function createDancer(input: {
  academyId: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  active?: boolean;
  documentType?: "dni" | "passport" | "other" | null;
  documentNumber?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}) {
  const [dancer] = await db
    .insert(dancers)
    .values({
      academyId: input.academyId,
      firstName: input.firstName,
      lastName: input.lastName,
      birthDate: input.birthDate,
      active: input.active ?? true,
      documentType: input.documentType ?? null,
      documentNumber: input.documentNumber ?? null,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
    })
    .returning();

  return dancer;
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

  return result.event;
}

async function linkDancerToEventChoreography(input: {
  eventId: string;
  academyId: string;
  dancerId: string;
  choreographyName: string;
}) {
  const modality = await expectCreated(
    createModality(input.eventId, {
      name: `${input.choreographyName} Mod`,
    }),
  );
  const block = await expectCreated(
    createScheduleBlock(input.eventId, {
      name: `${input.choreographyName} Bloque`,
      scheduledDate: "2026-05-01",
      startTime: "10:00",
      totalCapacity: 10,
      modalityIds: [modality.id],
    }),
  );
  const entry = await expectCreated(
    createScheduleEntry(block.id, {
      groupTypes: ["solo"],
      capacity: 10,
    }),
  );
  const [choreography] = await db
    .insert(choreographies)
    .values({
      eventId: input.eventId,
      academyId: input.academyId,
      name: input.choreographyName,
      modalityId: modality.id,
      groupType: "solo",
      categoryCalculationMode: "oldest",
      scheduleEntryId: entry.id,
    })
    .returning();

  await db.insert(choreographyDancers).values({
    choreographyId: choreography.id,
    dancerId: input.dancerId,
    ageAtEventStart: 14,
  });

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
    return;
  }

  throw new Error("Expected a Response to be thrown.");
}
