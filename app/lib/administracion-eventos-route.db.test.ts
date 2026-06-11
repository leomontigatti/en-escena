import { eq } from "drizzle-orm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { events, user } from "@/db/schema";
import { auth } from "@/lib/auth.server";
import { createEvent } from "@/lib/event-management.server";
import {
  AdministracionEventosRouteView,
  loader,
} from "@/routes/administracion_.ajustes_.eventos";
import {
  action as createAction,
  AdministracionEventoNuevoRouteView,
} from "@/routes/administracion_.ajustes_.eventos_.nuevo";

import { installDatabaseTestHooks } from "../../tests/db/harness";

installDatabaseTestHooks();

describe("administracion/ajustes/eventos route", () => {
  test("requires admin access for the Eventos screen", async () => {
    await expectThrownResponse(
      loader(
        routeArgs(
          new Request("http://localhost/administracion/ajustes/eventos"),
        ),
      ),
      302,
    );

    const { request } = await createSignedInRequest({
      email: "admin.eventos@example.com",
      role: "admin",
      requestUrl: "http://localhost/administracion/ajustes/eventos",
    });

    await expect(loader(routeArgs(request))).resolves.toMatchObject({
      email: "admin.eventos@example.com",
      events: [],
    });
  });

  test("renders an empty Eventos state with a link to create a new Evento", () => {
    const markup = renderRoute({
      email: "admin@example.com",
      events: [],
    });

    expect(markup).toContain("Todavía no hay Eventos creados.");
    expect(markup).toContain("/administracion/ajustes/eventos/nuevo");
    expect(markup).toContain("Crear Evento");
    expect(markup).not.toContain('name="name"');
    expect(markup).not.toContain('name="requiredDepositPercentage"');
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

    const { request } = await createSignedInRequest({
      email: "admin.listado@example.com",
      role: "admin",
      requestUrl: "http://localhost/administracion/ajustes/eventos",
    });
    const data = await loader(routeArgs(request));
    const markup = renderRoute(data);

    expect(data.events.map((event) => event.name)).toEqual([
      "Final 2027",
      "Regional 2026",
    ]);
    expect(markup).toContain(finalEvent.id);
    expect(markup).toContain("Regional 2026");
    expect(markup).toContain("Activo");
    expect(markup).toContain("Finalizado");
    expect(markup).toContain(
      `/administracion/ajustes/eventos/${finalEvent.id}`,
    );
    expect(markup).not.toContain("Acciones");
    expect(markup).not.toContain("Editar");
    expect(markup).not.toContain("Programa visible");
    expect(markup).not.toContain("Resultados ocultos");
    expect(markup).toContain("Final 2027");
    expect(markup).toContain("No iniciado");
  });

  test("creates an inactive Evento from the new route and redirects to detail", async () => {
    const { request } = await createSignedInRequest({
      email: "admin.crear@example.com",
      role: "admin",
      requestUrl: "http://localhost/administracion/ajustes/eventos/nuevo",
      body: eventFormData({
        name: "Metropolitano 2027",
        registrationStartsAt: "2027-03-01T09:00",
        registrationEndsAt: "2027-05-02T09:00",
        startsAt: "2027-05-01T09:00",
        endsAt: "2027-05-03T20:00",
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
    expect(response.headers.get("location")).toBe(
      `/administracion/ajustes/eventos/${savedEvent?.id}?guardado=1`,
    );
  });

  test("allows registration to end after the Evento starts", async () => {
    const { request } = await createSignedInRequest({
      email: "admin.inscripcion-tardia@example.com",
      role: "admin",
      requestUrl: "http://localhost/administracion/ajustes/eventos/nuevo",
      body: eventFormData({
        name: "Inscripción tardía 2027",
        registrationStartsAt: "2027-03-01T09:00",
        registrationEndsAt: "2027-05-02T09:00",
        startsAt: "2027-05-01T09:00",
        endsAt: "2027-05-03T20:00",
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
      requestUrl: "http://localhost/administracion/ajustes/eventos/nuevo",
      body: eventFormData({
        name: "",
        registrationStartsAt: "2027-03-01T09:00",
        registrationEndsAt: "2027-03-02T09:00",
        startsAt: "2027-05-01T09:00",
        endsAt: "2027-05-03T20:00",
        requiredDepositPercentage: "101",
      }),
    });

    await expect(createAction(newRouteArgs(request))).resolves.toMatchObject({
      status: "error",
      message: "Revisá los datos del Evento.",
      fieldErrors: {
        name: "Ingresá el nombre del Evento.",
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
      requestUrl: "http://localhost/administracion/ajustes/eventos/nuevo",
      body: eventFormData({
        name: "Fechas inválidas",
        registrationStartsAt: "2027-03-01T09:00",
        registrationEndsAt: "2027-05-04T09:00",
        startsAt: "2027-05-01T09:00",
        endsAt: "2027-05-03T20:00",
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

  test("shows a non-blocking warning when registration starts after the Evento starts", () => {
    const markup = renderCreateRoute(
      {
        eventOptions: [],
      },
      {
        status: "error",
        message: "Revisá los datos del Evento.",
        fieldErrors: {},
        values: {
          name: "Evento con inscripción tardía",
          registrationStartsAt: "2027-05-02T09:00",
          registrationEndsAt: "2027-05-03T09:00",
          startsAt: "2027-05-01T09:00",
          endsAt: "2027-05-03T20:00",
          requiredDepositPercentage: "30",
        },
      },
    );

    expect(markup).toContain(
      "La inscripción empieza después del inicio del Evento.",
    );
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
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: ["/administracion/ajustes/eventos"] },
      createElement(AdministracionEventosRouteView, {
        loaderData: {
          email: "admin@example.com",
          eventOptions: [],
          events: [],
          selectedEventId: null,
          ...loaderData,
        },
      }),
    ),
  );
}

function renderCreateRoute(
  loaderData: Partial<
    Parameters<typeof AdministracionEventoNuevoRouteView>[0]["loaderData"]
  >,
  actionData?: Parameters<
    typeof AdministracionEventoNuevoRouteView
  >[0]["actionData"],
) {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: ["/administracion/ajustes/eventos/nuevo"] },
      createElement(AdministracionEventoNuevoRouteView, {
        loaderData: {
          email: "admin@example.com",
          eventOptions: [],
          ...loaderData,
        },
        actionData,
      }),
    ),
  );
}

async function createSignedInRequest(input: {
  email: string;
  role: "academy" | "admin" | "auditor" | "judge";
  requestUrl: string;
  body?: FormData;
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
    pattern: "/administracion/ajustes/eventos",
  };
}

function newRouteArgs(request: Request) {
  return {
    request,
    params: {},
    context: {},
    url: new URL(request.url),
    pattern: "/administracion/ajustes/eventos/nuevo",
  };
}

function createRequestCookie(headers: Headers) {
  const setCookie = headers.get("set-cookie");

  if (!setCookie) {
    throw new Error("Expected Better Auth to return a session cookie.");
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
