import { eq } from "drizzle-orm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { events } from "@/db/schema";
import {
  createSignedInAdminRequest as createSignedInRequest,
  expectThrownResponse,
} from "@/lib/admin/test-support/db";
import {
  createAdminSavedEvent as createSavedEvent,
  testEventDate as date,
} from "@/lib/events/saved-event-test-support.server";
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
    const newRouteModule = await import(
      "@/routes/administracion.eventos_.nuevo"
    );

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
          "La seña de coreografía debe ser un entero entre 1 y 100.",
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
      message:
        "El cierre de inscripción no puede ser posterior al cierre del Evento.",
      fieldErrors: {
        registrationEndsAt:
          "El cierre de inscripción no puede ser posterior al cierre del Evento.",
      },
    });
    await expect(db.query.events.findMany()).resolves.toEqual([]);
  });
});

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
