import { eq } from "drizzle-orm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { events, user } from "@/db/schema";
import { auth } from "@/lib/auth/auth.server";
import { activateEvent, createEvent } from "@/lib/events/management.server";
import {
  action,
  AdministracionEventoDetalleRouteView,
  loader,
} from "@/routes/administracion.eventos_.$eventId";

import { installDatabaseTestHooks } from "../../../../tests/db/harness";

installDatabaseTestHooks();

describe("administracion/eventos/:eventId route", () => {
  test("loads an Evento detail screen governed by the event URL", async () => {
    const event = await createSavedEvent({ name: "Regional 2026" });
    const { request } = await createSignedInRequest({
      email: "admin.detalle@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/eventos/${event.id}`,
    });

    const data = await loader(routeArgs(request, event.id));
    const markup = renderRoute(data);

    expect(data.event.id).toBe(event.id);
    expect(data.event.name).toBe("Regional 2026");
    expect(markup).toContain("Editar evento");
    expect(markup).not.toContain("Evento de trabajo");
  });

  test("updates Evento editable fields from the detail screen", async () => {
    const event = await createSavedEvent({ name: "Regional 2026" });
    const { request } = await createSignedInRequest({
      email: "admin.editar@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/eventos/${event.id}`,
      body: formData({
        intent: "update",
        name: "Regional actualizado",
        registrationStartsAt: "2027-03-01",
        registrationEndsAt: "2027-05-02",
        startsAt: "2027-05-01",
        endsAt: "2027-05-03",
        requiredDepositPercentage: "45",
      }),
    });

    const response = await expectThrownResponse(
      action(routeArgs(request, event.id)),
      302,
    );

    await expect(
      db.query.events.findFirst({ where: eq(events.id, event.id) }),
    ).resolves.toMatchObject({
      name: "Regional actualizado",
      requiredDepositPercentage: 45,
    });
    const savedEvent = await db.query.events.findFirst({
      where: eq(events.id, event.id),
    });

    expect(savedEvent?.startsAt.toISOString()).toBe("2027-05-01T03:00:00.000Z");
    expect(savedEvent?.endsAt.toISOString()).toBe("2027-05-03T03:00:00.000Z");
    expect(response.headers.get("location")).toBe(
      `/administracion/eventos/${event.id}?notificacion=evento-guardado`,
    );
  });

  test("reports activation conflicts without changing the selected Evento", async () => {
    const activeEvent = await createSavedEvent({ name: "Activo" });
    const inactiveEvent = await createSavedEvent({ name: "Inactivo" });
    await activateEvent(activeEvent.id);
    const { request } = await createSignedInRequest({
      email: "admin.activar@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/eventos/${inactiveEvent.id}`,
      body: formData({ intent: "activate" }),
    });

    await expect(action(routeArgs(request, inactiveEvent.id))).resolves.toEqual(
      {
        status: "error",
        message:
          "Hay otro evento activo. Desactivá el evento activo antes de activar este.",
        fieldErrors: {},
        values: null,
      },
    );

    await expect(
      db.query.events.findFirst({ where: eq(events.id, inactiveEvent.id) }),
    ).resolves.toMatchObject({ active: false });
  });

  test("requires confirmation before deactivating an active Evento", async () => {
    const event = await createSavedEvent({ name: "Activo" });
    await activateEvent(event.id);
    const blockedRequest = await createSignedInRequest({
      email: "admin.desactivar.bloqueado@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/eventos/${event.id}`,
      body: formData({ intent: "deactivate" }),
    });

    await expect(
      action(routeArgs(blockedRequest.request, event.id)),
    ).resolves.toMatchObject({
      status: "error",
      message: "Confirmá la desactivación del evento.",
    });

    const confirmedRequest = await createSignedInRequest({
      email: "admin.desactivar@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/eventos/${event.id}`,
      body: formData({ intent: "deactivate", confirmDeactivation: event.id }),
    });

    await expectThrownResponse(
      action(routeArgs(confirmedRequest.request, event.id)),
      302,
    ).then((response) => {
      expect(response.headers.get("location")).toBe(
        `/administracion/eventos/${event.id}?notificacion=evento-desactivado`,
      );
    });
    await expect(
      db.query.events.findFirst({ where: eq(events.id, event.id) }),
    ).resolves.toMatchObject({ active: false });
  });

  test("toggles program and results visibility independently", async () => {
    const event = await createSavedEvent({ name: "Regional 2026" });
    const programRequest = await createSignedInRequest({
      email: "admin.programa@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/eventos/${event.id}`,
      body: formData({ intent: "set-program-visibility", value: "true" }),
    });
    const resultsRequest = await createSignedInRequest({
      email: "admin.resultados@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/eventos/${event.id}`,
      body: formData({ intent: "set-results-visibility", value: "true" }),
    });

    const programResponse = await expectThrownResponse(
      action(routeArgs(programRequest.request, event.id)),
      302,
    );
    const resultsResponse = await expectThrownResponse(
      action(routeArgs(resultsRequest.request, event.id)),
      302,
    );

    expect(programResponse.headers.get("location")).toBe(
      `/administracion/eventos/${event.id}?notificacion=programa-visible`,
    );
    expect(resultsResponse.headers.get("location")).toBe(
      `/administracion/eventos/${event.id}?notificacion=resultados-visibles`,
    );
    await expect(
      db.query.events.findFirst({ where: eq(events.id, event.id) }),
    ).resolves.toMatchObject({
      programVisible: true,
      resultsVisible: true,
    });
  });

  test("deletes only after explicit confirmation and returns to the Eventos list", async () => {
    const event = await createSavedEvent({ name: "Borrable" });
    const blockedRequest = await createSignedInRequest({
      email: "admin.borrar.bloqueado@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/eventos/${event.id}`,
      body: formData({ intent: "delete" }),
    });

    await expect(
      action(routeArgs(blockedRequest.request, event.id)),
    ).resolves.toMatchObject({
      status: "error",
      message: "Confirmá el borrado del evento.",
    });

    const confirmedRequest = await createSignedInRequest({
      email: "admin.borrar@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/eventos/${event.id}`,
      body: formData({ intent: "delete", confirmDeletion: event.id }),
    });

    const response = await expectThrownResponse(
      action(routeArgs(confirmedRequest.request, event.id)),
      302,
    );

    await expect(
      db.query.events.findFirst({ where: eq(events.id, event.id) }),
    ).resolves.toBeUndefined();
    expect(response.headers.get("location")).toBe(
      "/administracion/eventos?notificacion=evento-eliminado",
    );
  });

  test("posts event mutations to the clean event URL when a previous notification is present", async () => {
    const event = await createSavedEvent({ name: "Activo" });
    await activateEvent(event.id);
    const { request } = await createSignedInRequest({
      email: "admin.evento.notificacion@example.com",
      role: "admin",
      requestUrl: `http://localhost/administracion/eventos/${event.id}?notificacion=evento-guardado`,
    });

    const data = await loader(routeArgs(request, event.id));
    const markup = renderRoute(
      data,
      undefined,
      `/administracion/eventos/${event.id}?notificacion=evento-guardado`,
    );

    expect(markup).toContain(`action="/administracion/eventos/${event.id}"`);
    expect(markup).not.toContain("notificacion=evento-guardado");
  });
});

async function createSavedEvent(
  overrides: Partial<Parameters<typeof createEvent>[0]>,
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

  return result.event;
}

function renderRoute(
  loaderData: Parameters<
    typeof AdministracionEventoDetalleRouteView
  >[0]["loaderData"],
  actionData?: Parameters<
    typeof AdministracionEventoDetalleRouteView
  >[0]["actionData"],
  initialEntry = `/administracion/eventos/${loaderData.event.id}`,
) {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      {
        initialEntries: [initialEntry],
      },
      createElement(AdministracionEventoDetalleRouteView, {
        loaderData,
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

function formData(input: Record<string, string>) {
  const form = new FormData();

  for (const [key, value] of Object.entries(input)) {
    form.set(key, value);
  }

  return form;
}

function routeArgs(request: Request, eventId: string) {
  return {
    request,
    params: { eventId },
    context: {},
    url: new URL(request.url),
    pattern: "/administracion/eventos/:eventId",
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
