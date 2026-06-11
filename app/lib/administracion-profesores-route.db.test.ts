import { eq } from "drizzle-orm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import {
  academies,
  choreographyProfessors,
  choreographies,
  professors,
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
  AdministracionProfesoresRouteView,
  loader,
} from "@/routes/administracion_.profesores";
import {
  AdministracionProfesorDetalleRouteView,
  loader as detailLoader,
} from "@/routes/administracion_.profesores_.$professorId";

import { installDatabaseTestHooks } from "../../tests/db/harness";

installDatabaseTestHooks();

describe("administracion/profesores route", () => {
  test("allows admin access and renders an empty readonly Profesores list", async () => {
    const { request } = await createSignedInRequest({
      email: "admin.profesores@example.com",
      role: "admin",
      requestUrl: "http://localhost/administracion/profesores",
    });

    const loaderData = await loader(routeArgs(request));
    const markup = renderRoute(loaderData);

    expect(loaderData.email).toBe("admin.profesores@example.com");
    expect(markup).toContain("Profesores");
    expect(markup).toContain("Todavía no hay Profesores para mostrar.");
    expect(markup).not.toContain("Acciones");
  });

  test("allows auditor access and blocks academy and judge users", async () => {
    const event = await createSavedEvent();
    const { request: auditorRequest } = await createSignedInRequest({
      email: "auditor.profesores@example.com",
      role: "auditor",
      requestUrl: `http://localhost/administracion/profesores?evento=${event.id}`,
    });

    await expect(loader(routeArgs(auditorRequest))).resolves.toMatchObject({
      email: "auditor.profesores@example.com",
    });

    const { request: academyRequest } = await createSignedInRequest({
      email: "academy.profesores@example.com",
      role: "academy",
      requestUrl: `http://localhost/administracion/profesores?evento=${event.id}`,
    });
    const { request: judgeRequest } = await createSignedInRequest({
      email: "judge.profesores@example.com",
      role: "judge",
      requestUrl: `http://localhost/administracion/profesores?evento=${event.id}`,
    });

    await expectThrownResponse(loader(routeArgs(academyRequest)), 403);
    await expectThrownResponse(loader(routeArgs(judgeRequest)), 403);
  });

  test("filters by participation and search, paginates server-side, and renders readonly badges", async () => {
    const event = await createSavedEvent();
    const northAcademy = await createAcademyUser({
      email: "academia.norte@example.com",
      academyName: "Academia Norte",
      contactName: "Luz Norte",
      phone: "1111-1111",
    });
    const southAcademy = await createAcademyUser({
      email: "academia.sur@example.com",
      academyName: "Academia Sur",
      contactName: "Nora Sur",
      phone: "2222-2222",
    });
    const participatingProfessor = await createProfessor({
      academyId: northAcademy.academy.id,
      firstName: "Ana",
      lastName: "Participa",
      documentNumber: "1001",
    });
    const nonParticipatingProfessor = await createProfessor({
      academyId: southAcademy.academy.id,
      firstName: "Bruno",
      lastName: "Consulta",
      documentNumber: "2002",
    });
    const archivedProfessor = await createProfessor({
      academyId: northAcademy.academy.id,
      firstName: "Carla",
      lastName: "Archivada",
      active: false,
      documentNumber: "3003",
    });

    await linkProfessorToEventChoreography({
      eventId: event.id,
      academyId: northAcademy.academy.id,
      professorId: participatingProfessor.id,
      choreographyName: "Amanecer",
    });
    await linkProfessorToEventChoreography({
      eventId: event.id,
      academyId: northAcademy.academy.id,
      professorId: archivedProfessor.id,
      choreographyName: "Noche",
    });

    for (let index = 0; index < 51; index += 1) {
      await createProfessor({
        academyId: northAcademy.academy.id,
        firstName: `Extra ${index + 1}`,
        lastName: "Fila",
      });
    }

    const { request: defaultRequest } = await createSignedInRequest({
      email: "admin.filtros@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/profesores?evento=${event.id}`,
    });
    const defaultData = await loader(routeArgs(defaultRequest));

    expect(defaultData.filters.participation).toBe("yes");
    expect(defaultData.professors.map((professor) => professor.id)).toEqual([
      participatingProfessor.id,
    ]);

    const { request: searchRequest } = await createSignedInRequest({
      email: "admin.busqueda@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/profesores?evento=${event.id}&participando=todos&estado=todos&q=Academia+Sur`,
    });
    const searchData = await loader(routeArgs(searchRequest));
    const searchMarkup = renderRoute(searchData);

    expect(searchData.professors.map((professor) => professor.id)).toEqual([
      nonParticipatingProfessor.id,
    ]);
    expect(searchMarkup).toContain("No participando");
    expect(searchMarkup).toContain("Activo");
    expect(searchMarkup).not.toContain("Acciones");
    expect(searchMarkup).toContain(
      `/administracion/profesores/${nonParticipatingProfessor.id}?evento=${event.id}`,
    );
    expect(searchMarkup).toContain("participando=todos");
    expect(searchMarkup).toContain("estado=todos");
    expect(searchMarkup).toContain("q=Academia+Sur");

    const { request: archivedRequest } = await createSignedInRequest({
      email: "admin.archivados@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/profesores?evento=${event.id}&estado=archivados`,
    });
    const archivedData = await loader(routeArgs(archivedRequest));
    const archivedMarkup = renderRoute(archivedData);

    expect(archivedData.professors.map((professor) => professor.id)).toEqual([
      archivedProfessor.id,
    ]);
    expect(archivedMarkup).toContain("Archivado");
    expect(archivedMarkup).toContain("Participando");

    const { request: pageTwoRequest } = await createSignedInRequest({
      email: "admin.paginacion@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/profesores?evento=${event.id}&participando=todos&page=2`,
    });
    const pageTwoData = await loader(routeArgs(pageTwoRequest));
    const pageTwoMarkup = renderRoute(pageTwoData);

    expect(pageTwoData.totalCount).toBe(53);
    expect(pageTwoData.professors).toHaveLength(3);
    expect(pageTwoData.filters.page).toBe(2);
    expect(pageTwoMarkup).toContain("53 resultados");
    expect(pageTwoMarkup).toContain("Página 2 de 2");
    expect(pageTwoMarkup).toContain("Página anterior");
  });

  test("shows Sin evento badges when there is no Evento de trabajo", async () => {
    const academy = await createAcademyUser({
      email: "sin.evento@example.com",
      academyName: "Academia Base",
      contactName: "Ceci Base",
      phone: "3333-3333",
    });
    const professor = await createProfessor({
      academyId: academy.academy.id,
      firstName: "Diego",
      lastName: "Base",
    });
    const { request } = await createSignedInRequest({
      email: "admin.sin-evento@example.com",
      role: "admin",
      requestUrl: "http://localhost/administracion/profesores",
    });

    const loaderData = await loader(routeArgs(request));
    const markup = renderRoute(loaderData);

    expect(loaderData.selectedEventId).toBeNull();
    expect(loaderData.filters.participation).toBe("all");
    expect(loaderData.professors.map((item) => item.id)).toEqual([
      professor.id,
    ]);
    expect(markup).toContain("Sin evento");
  });

  test("renders a readonly Profesor ficha with academy contact and participation data", async () => {
    const event = await createSavedEvent();
    const academy = await createAcademyUser({
      email: "ficha.academia@example.com",
      academyName: "Academia Ficha",
      contactName: "Elena Ficha",
      phone: "4444-4444",
    });
    const professor = await createProfessor({
      academyId: academy.academy.id,
      firstName: "Julia",
      lastName: "Detalle",
      documentType: "passport",
      documentNumber: "AA123456",
      createdAt: new Date("2026-01-10T12:00:00Z"),
      updatedAt: new Date("2026-06-05T15:30:00Z"),
    });

    await linkProfessorToEventChoreography({
      eventId: event.id,
      academyId: academy.academy.id,
      professorId: professor.id,
      choreographyName: "Raíz",
    });

    const { request } = await createSignedInRequest({
      email: "auditor.ficha@example.com",
      role: "auditor",
      requestUrl: `http://localhost/administracion/profesores/${professor.id}?evento=${event.id}&estado=todos&participando=todos&page=2&q=Julia`,
    });

    const loaderData = await detailLoader(
      detailRouteArgs(request, professor.id),
    );
    const markup = renderDetailRoute(loaderData, professor.id);

    expect(markup).toContain("Academia Ficha");
    expect(markup).toContain("Elena Ficha");
    expect(markup).toContain("ficha.academia@example.com");
    expect(markup).toContain("4444-4444");
    expect(markup).toContain("Pasaporte AA123456");
    expect(markup).toContain("Participando en el Evento de trabajo.");
    expect(markup).toContain("Raíz");
    expect(markup).toContain(`/administracion/profesores?evento=${event.id}`);
    expect(markup).toContain("estado=todos");
    expect(markup).toContain("participando=todos");
    expect(markup).toContain("page=2");
    expect(markup).toContain("q=Julia");
    expect(markup).not.toContain("Editar");
    expect(markup).not.toContain("Archivar Profesor");
  });
});

function renderRoute(
  loaderData: Parameters<
    typeof AdministracionProfesoresRouteView
  >[0]["loaderData"],
) {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      {
        initialEntries: ["/administracion/profesores"],
      },
      createElement(AdministracionProfesoresRouteView, { loaderData }),
    ),
  );
}

function renderDetailRoute(
  loaderData: Parameters<
    typeof AdministracionProfesorDetalleRouteView
  >[0]["loaderData"],
  professorId: string,
) {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      {
        initialEntries: [`/administracion/profesores/${professorId}`],
      },
      createElement(AdministracionProfesorDetalleRouteView, { loaderData }),
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
    pattern: "/administracion/profesores",
  };
}

function detailRouteArgs(request: Request, professorId: string) {
  return {
    request,
    params: { professorId },
    context: {},
    url: new URL(request.url),
    pattern: "/administracion/profesores/:professorId",
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

async function createProfessor(input: {
  academyId: string;
  firstName: string;
  lastName: string;
  active?: boolean;
  documentType?: "dni" | "passport" | "other" | null;
  documentNumber?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}) {
  const [professor] = await db
    .insert(professors)
    .values({
      academyId: input.academyId,
      firstName: input.firstName,
      lastName: input.lastName,
      active: input.active ?? true,
      documentType: input.documentType ?? "dni",
      documentNumber: input.documentNumber ?? null,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
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

  return result.event;
}

async function linkProfessorToEventChoreography(input: {
  eventId: string;
  academyId: string;
  professorId: string;
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

  await db.insert(choreographyProfessors).values({
    choreographyId: choreography.id,
    professorId: input.professorId,
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

    return response;
  }

  throw new Error(`Expected a thrown response with status ${expectedStatus}.`);
}
