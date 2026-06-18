import { eq } from "drizzle-orm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { user } from "@/db/schema";
import { createLocalAccessUser } from "@/lib/auth/access-test-auth.server";
import { activateEvent, createEvent } from "@/lib/events/management.server";
import {
  AdministracionIndexRouteView,
  loader,
} from "@/routes/administracion._index";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

describe("administracion index route", () => {
  test("shows an alert when the active Evento is not ready for choreography registration", async () => {
    const event = await createSavedEvent({ name: "En Escena 2026" });
    await activateEvent(event.id);
    const { request } = await createSignedInRequest({
      email: "admin.dashboard.readiness@example.com",
      role: "admin",
      requestUrl: "http://localhost/administracion",
    });

    const data = await loader(routeArgs(request));
    const markup = renderRoute(data);

    expect(data.activeEvent).toMatchObject({
      id: event.id,
      name: "En Escena 2026",
    });
    expect(data.activeEventRegistrationReadiness?.isReady).toBe(false);
    expect(markup).toContain("Falta configurar bases para el evento activo.");
    expect(markup).toContain("Podés revisarlas acá");
    expect(markup).toContain(`/administracion/eventos/${event.id}`);
    expect(markup).toContain("En Escena 2026");
  });

  test("does not show the bases alert when there is no active Evento", async () => {
    const { request } = await createSignedInRequest({
      email: "admin.dashboard.empty@example.com",
      role: "admin",
      requestUrl: "http://localhost/administracion",
    });

    const data = await loader(routeArgs(request));
    const markup = renderRoute(data);

    expect(data.activeEvent).toBeNull();
    expect(markup).toContain("Panel de administración");
    expect(markup).not.toContain(
      "Falta configurar bases para el evento activo.",
    );
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
  loaderData: Parameters<typeof AdministracionIndexRouteView>[0]["loaderData"],
) {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      {
        initialEntries: ["/administracion"],
      },
      createElement(AdministracionIndexRouteView, {
        loaderData,
      }),
    ),
  );
}

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

function routeArgs(request: Request) {
  return {
    request,
    params: {},
    context: {},
    url: new URL(request.url),
    pattern: "/administracion",
  };
}

function createRequestCookie(headers: Headers) {
  const setCookie = headers.get("set-cookie");

  if (!setCookie) {
    throw new Error("Expected Better Auth to return a session cookie.");
  }

  return setCookie.split(";")[0] ?? "";
}

function date(value: string) {
  return new Date(value);
}
