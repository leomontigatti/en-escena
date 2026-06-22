import { eq } from "drizzle-orm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { events, user } from "@/db/schema";
import { createLocalAccessUser } from "@/lib/auth/access-test-auth.server";
import { createEvent } from "@/lib/events/management.server";
import {
  AdministracionRouteView,
  loader as adminLoader,
} from "@/routes/administracion";
import {
  AdministracionEventosRouteView,
  handle as eventosHandle,
  loader,
} from "@/routes/administracion.eventos";
import {
  handle as eventoDetalleHandle,
  loader as detailLoader,
} from "@/routes/administracion.eventos_.$eventId";
import { handle as eventoNuevoHandle } from "@/routes/administracion.eventos_.nuevo";
import { action as createAction } from "@/routes/administracion.eventos_.nuevo";

import { installDatabaseTestHooks } from "../../../../tests/db/harness";

installDatabaseTestHooks();

describe("administracion/eventos route", () => {
  test("requires admin access for the Eventos screen", async () => {
    await expectThrownResponse(
      loader(routeArgs(new Request("http://localhost/administracion/eventos"))),
      302,
    );

    const { request } = await createSignedInRequest({
      email: "admin.eventos@example.com",
      role: "admin",
      requestUrl: "http://localhost/administracion/eventos",
    });

    await expect(loader(routeArgs(request))).resolves.toMatchObject({
      events: [],
    });
  });

  test("lists Eventos with name, registration dates, event dates and state", async () => {
    const finalEvent = await createSavedEvent({
      name: "Regional 2026",
      startsAt: date("2026-05-01T12:00:00Z"),
      endsAt: date("2026-05-03T12:00:00Z"),
      active: true,
      programVisible: true,
      resultsVisible: false,
    });
    await createSavedEvent({
      name: "Final 2027",
      startsAt: date("2027-05-01T12:00:00Z"),
      endsAt: date("2027-05-03T12:00:00Z"),
      requiredDepositPercentage: 45,
    });
    await createSavedEvent({
      name: "Regional 2025",
      registrationStartsAt: date("2025-03-01T12:00:00Z"),
      registrationEndsAt: date("2025-04-30T12:00:00Z"),
      startsAt: date("2025-05-01T12:00:00Z"),
      endsAt: date("2025-05-03T12:00:00Z"),
    });

    const { request } = await createSignedInRequest({
      email: "admin.listado@example.com",
      role: "admin",
      requestUrl: "http://localhost/administracion/eventos",
    });
    const data = await loader(routeArgs(request));
    const markup = renderRoute(data);

    expect(data.events.map((event) => event.name)).toEqual([
      "Final 2027",
      "Regional 2026",
      "Regional 2025",
    ]);
    expect(
      data.events.find((event) => event.name === "Regional 2025"),
    ).toMatchObject({
      shouldShowRegistrationReadiness: false,
      temporalState: { value: "finished" },
    });
    expect(markup).toContain(finalEvent.id);
    expect(markup).toContain("Evento activo");
    expect(markup).toContain("Regional 2026");
    expect(markup).toContain("Activo");
    expect(markup).toContain("Finalizado");
    expect(markup).toContain("Configuración pendiente");
    expect(markup).toContain(`/administracion/eventos/${finalEvent.id}`);
    expect(markup).not.toContain("Acciones");
    expect(markup).not.toContain("Editar");
    expect(markup).not.toContain("Programa visible");
    expect(markup).not.toContain("Resultados ocultos");
    expect(markup).toContain("Final 2027");
    expect(markup).toContain("No iniciado");
  });

  test("loads only the active Evento summary in the admin shell for the Eventos family", async () => {
    const activeEvent = await createSavedEvent({
      name: "Regional 2026",
      active: true,
    });
    await createSavedEvent({
      name: "Final 2027",
      startsAt: date("2027-05-01T12:00:00Z"),
      endsAt: date("2027-05-03T12:00:00Z"),
    });
    const { request } = await createSignedInRequest({
      email: "admin.shell.eventos@example.com",
      role: "admin",
      requestUrl: "http://localhost/administracion/eventos",
    });

    const shellData = await adminLoader(adminRouteArgs(request));
    const routeData = await loader(routeArgs(request));

    expect(shellData).toMatchObject({
      email: "admin.shell.eventos@example.com",
      events: [{ id: activeEvent.id, name: "Regional 2026", active: true }],
      selectedEventId: activeEvent.id,
    });
    expect(shellData.events).toHaveLength(1);
    expect(routeData.events.map((event) => event.name)).toEqual([
      "Final 2027",
      "Regional 2026",
    ]);
  });

  test("keeps Eventos child route data focused on resource content", async () => {
    const event = await createSavedEvent({ name: "Regional 2026" });
    const { request: listRequest } = await createSignedInRequest({
      email: "admin.route-contract.list@example.com",
      role: "admin",
      requestUrl: "http://localhost/administracion/eventos",
    });
    const { request: detailRequest } = await createSignedInRequest({
      email: "admin.route-contract.detail@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/eventos/${event.id}`,
    });
    const newRouteModule =
      await import("@/routes/administracion.eventos_.nuevo");

    const listData = await loader(routeArgs(listRequest));
    const detailData = await detailLoader(
      detailRouteArgs(detailRequest, event.id),
    );

    expectShellDataNotReturned(listData);
    expectShellDataNotReturned(detailData);
    expect(Object.hasOwn(newRouteModule, "loader")).toBe(false);
  });

  test("creates an inactive Evento from the new route and redirects to detail", async () => {
    const { request } = await createSignedInRequest({
      email: "admin.crear@example.com",
      role: "admin",
      requestUrl: "http://localhost/administracion/eventos/nuevo",
      body: eventFormData({
        name: "Metropolitano 2027",
        registrationStartsAt: "2027-03-01",
        registrationEndsAt: "2027-05-02",
        startsAt: "2027-05-01",
        endsAt: "2027-05-03",
        requiredDepositPercentage: "45",
      }),
    });

    const response = await expectThrownResponse(
      createAction(newRouteArgs(request)),
      302,
    );
    const savedEvent = await db.query.events.findFirst({
      where: eq(events.name, "Metropolitano 2027"),
    });

    expect(savedEvent).toMatchObject({
      active: false,
      programVisible: false,
      resultsVisible: false,
      requiredDepositPercentage: 45,
    });
    expect(savedEvent?.startsAt.toISOString()).toBe("2027-05-01T03:00:00.000Z");
    expect(savedEvent?.endsAt.toISOString()).toBe("2027-05-03T03:00:00.000Z");
    expect(response.headers.get("location")).toBe(
      `/administracion/eventos/${savedEvent?.id}?notificacion=evento-guardado`,
    );
  });

  test("allows registration to end after the Evento starts", async () => {
    const { request } = await createSignedInRequest({
      email: "admin.inscripcion-tardia@example.com",
      role: "admin",
      requestUrl: "http://localhost/administracion/eventos/nuevo",
      body: eventFormData({
        name: "Inscripción tardía 2027",
        registrationStartsAt: "2027-03-01",
        registrationEndsAt: "2027-05-02",
        startsAt: "2027-05-01",
        endsAt: "2027-05-03",
        requiredDepositPercentage: "30",
      }),
    });

    await expectThrownResponse(createAction(newRouteArgs(request)), 302);

    await expect(
      db.query.events.findFirst({
        where: eq(events.name, "Inscripción tardía 2027"),
      }),
    ).resolves.toMatchObject({
      name: "Inscripción tardía 2027",
      active: false,
    });
  });

  test("returns validation failures without creating an Evento", async () => {
    const { request } = await createSignedInRequest({
      email: "admin.validacion@example.com",
      role: "admin",
      requestUrl: "http://localhost/administracion/eventos/nuevo",
      body: eventFormData({
        name: "",
        registrationStartsAt: "2027-03-01",
        registrationEndsAt: "2027-03-02",
        startsAt: "2027-05-01",
        endsAt: "2027-05-03",
        requiredDepositPercentage: "101",
      }),
    });

    await expect(createAction(newRouteArgs(request))).resolves.toMatchObject({
      status: "error",
      message: "Revisá los datos del Evento.",
      fieldErrors: {
        name: "Este campo es obligatorio.",
        requiredDepositPercentage:
          "La seña requerida debe ser un entero entre 0 y 100.",
      },
    });
    await expect(db.query.events.findMany()).resolves.toEqual([]);
  });

  test("returns date validation failures without creating an Evento", async () => {
    const { request } = await createSignedInRequest({
      email: "admin.fechas@example.com",
      role: "admin",
      requestUrl: "http://localhost/administracion/eventos/nuevo",
      body: eventFormData({
        name: "Fechas inválidas",
        registrationStartsAt: "2027-03-01",
        registrationEndsAt: "2027-05-04",
        startsAt: "2027-05-01",
        endsAt: "2027-05-03",
        requiredDepositPercentage: "30",
      }),
    });

    await expect(createAction(newRouteArgs(request))).resolves.toMatchObject({
      status: "error",
      fieldErrors: {
        registrationEndsAt:
          "El cierre de inscripción no puede ser posterior al cierre del Evento.",
      },
    });
    await expect(db.query.events.findMany()).resolves.toEqual([]);
  });
});

async function createSavedEvent(
  overrides: Partial<Parameters<typeof createEvent>[0]> & {
    active?: boolean;
    programVisible?: boolean;
    resultsVisible?: boolean;
  },
) {
  const result = await createEvent({
    name: "Evento 2026",
    registrationStartsAt: date("2026-03-01T12:00:00Z"),
    registrationEndsAt: date("2026-04-30T12:00:00Z"),
    startsAt: date("2026-05-01T12:00:00Z"),
    endsAt: date("2026-05-03T12:00:00Z"),
    ...overrides,
  });

  if (!result.ok) {
    throw new Error(result.error);
  }

  const updates = {
    active: overrides.active,
    programVisible: overrides.programVisible,
    resultsVisible: overrides.resultsVisible,
  };
  const definedUpdates = Object.fromEntries(
    Object.entries(updates).filter(([, value]) => value !== undefined),
  );

  if (Object.keys(definedUpdates).length === 0) {
    return result.event;
  }

  const [event] = await db
    .update(events)
    .set(definedUpdates)
    .where(eq(events.id, result.event.id))
    .returning();

  return event ?? result.event;
}

function renderRoute(
  loaderData: Partial<
    Parameters<typeof AdministracionEventosRouteView>[0]["loaderData"]
  >,
) {
  const eventsLoaderData = {
    events: [],
    ...loaderData,
  };
  const RoutesStub = createRoutesStub([
    {
      id: "admin",
      path: "/administracion",
      Component: AdministracionRouteView,
      children: [
        {
          id: "events",
          path: "eventos",
          Component: AdministracionEventosRouteView,
          handle: eventosHandle,
        },
        {
          id: "event-detail",
          path: "eventos/:eventId",
          Component: () => createElement("h1", null, "Detalle evento"),
          handle: eventoDetalleHandle,
        },
        {
          id: "event-new",
          path: "eventos/nuevo",
          Component: () => createElement("h1", null, "Nuevo evento"),
          handle: eventoNuevoHandle,
        },
      ],
    },
  ]);

  return renderToStaticMarkup(
    createElement(RoutesStub, {
      initialEntries: ["/administracion/eventos"],
      hydrationData: {
        loaderData: {
          admin: adminLoaderData(),
          events: eventsLoaderData,
        },
      },
    }),
  );
}

function adminLoaderData() {
  return {
    email: "admin@example.com",
    events: [{ id: "evento_2026", name: "Evento 2026", active: true }],
    selectedEventId: "evento_2026",
  };
}

async function createSignedInRequest(input: {
  email: string;
  role: "academy" | "admin" | "auditor" | "judge";
  requestUrl: string;
  body?: FormData;
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
      method: input.body ? "POST" : "GET",
      body: input.body,
      headers: {
        cookie: createRequestCookie(signUpResult.headers),
      },
    }),
  };
}

function eventFormData(input: Record<string, string>) {
  const formData = new FormData();

  for (const [key, value] of Object.entries(input)) {
    formData.set(key, value);
  }

  return formData;
}

function routeArgs(request: Request) {
  return {
    request,
    params: {},
    context: {},
    url: new URL(request.url),
    pattern: "/administracion/eventos",
  };
}

function adminRouteArgs(request: Request) {
  return {
    request,
    params: {},
    context: {},
    url: new URL(request.url),
    pattern: "/administracion",
  };
}

function newRouteArgs(request: Request) {
  return {
    request,
    params: {},
    context: {},
    url: new URL(request.url),
    pattern: "/administracion/eventos/nuevo",
  };
}

function detailRouteArgs(request: Request, eventId: string) {
  return {
    request,
    params: { eventId },
    context: {},
    url: new URL(request.url),
    pattern: "/administracion/eventos/:eventId",
  };
}

function expectShellDataNotReturned(loaderData: object) {
  expect(loaderData).not.toHaveProperty("email");
  expect(loaderData).not.toHaveProperty("eventOptions");
  expect(loaderData).not.toHaveProperty("selectedEventId");
}

function createRequestCookie(headers: Headers) {
  const setCookie = headers.get("set-cookie");

  if (!setCookie) {
    throw new Error("Expected access auth to return a session cookie.");
  }

  return setCookie.split(";")[0] ?? "";
}

async function expectThrownResponse(
  resultPromise: Promise<unknown>,
  status: number,
) {
  try {
    await resultPromise;
  } catch (error) {
    expect(error).toBeInstanceOf(Response);
    expect((error as Response).status).toBe(status);
    return error as Response;
  }

  throw new Error("Expected a response to be thrown.");
}

function date(value: string) {
  return new Date(value);
}
