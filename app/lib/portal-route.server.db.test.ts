import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { academies, user } from "@/db/schema";
import { auth } from "@/lib/auth.server";
import { activateEvent, createEvent } from "@/lib/event-management.server";
import { loader as portalLoader } from "@/routes/portal";
import { loader as bailarinesLoader } from "@/routes/portal.bailarines";
import { loader as profesoresLoader } from "@/routes/portal.profesores";

import { installDatabaseTestHooks } from "../../tests/db/harness";

installDatabaseTestHooks();

describe("portal loader Evento consultado", () => {
  test("defaults to the active Evento and exposes every Evento for the selector", async () => {
    const historicalEvent = await createSavedEvent({
      name: "Regional 2025",
      registrationStartsAt: date("2025-03-01T12:00:00Z"),
      registrationEndsAt: date("2025-04-30T12:00:00Z"),
      startsAt: date("2025-05-01T12:00:00Z"),
      endsAt: date("2025-05-03T12:00:00Z"),
    });
    const activeEvent = await createSavedEvent({
      name: "Regional 2026",
      startsAt: date("2026-05-01T12:00:00Z"),
      endsAt: date("2026-05-03T12:00:00Z"),
    });
    await activateEvent(activeEvent.id);

    const loaderData = await loadPortal("http://localhost/portal");

    expect(loaderData.eventContext.selectedEvent).toMatchObject({
      id: activeEvent.id,
      name: "Regional 2026",
      active: true,
    });
    expect(loaderData.eventContext.events.map((event) => event.id)).toEqual([
      activeEvent.id,
      historicalEvent.id,
    ]);
  });

  test("uses the Evento consultado from the URL query when it exists", async () => {
    const selectedEvent = await createSavedEvent({ name: "Seleccionado" });
    const activeEvent = await createSavedEvent({
      name: "Activo",
      startsAt: date("2027-05-01T12:00:00Z"),
      endsAt: date("2027-05-03T12:00:00Z"),
      registrationStartsAt: date("2027-03-01T12:00:00Z"),
      registrationEndsAt: date("2027-04-30T12:00:00Z"),
    });
    await activateEvent(activeEvent.id);

    const loaderData = await loadPortal(
      `http://localhost/portal?evento=${selectedEvent.id}`,
    );

    expect(loaderData.eventContext.selectedEvent).toMatchObject({
      id: selectedEvent.id,
      name: "Seleccionado",
      active: false,
    });
    expect(loaderData.eventContext.isReadOnly).toBe(true);
  });

  test("defaults to the most recent Evento by start date when no Evento is active", async () => {
    const olderEvent = await createSavedEvent({
      name: "Regional 2025",
      registrationStartsAt: date("2025-03-01T12:00:00Z"),
      registrationEndsAt: date("2025-04-30T12:00:00Z"),
      startsAt: date("2025-05-01T12:00:00Z"),
      endsAt: date("2025-05-03T12:00:00Z"),
    });
    const recentEvent = await createSavedEvent({
      name: "Regional 2026",
      startsAt: date("2026-05-01T12:00:00Z"),
      endsAt: date("2026-05-03T12:00:00Z"),
    });

    const loaderData = await loadPortal("http://localhost/portal");

    expect(loaderData.eventContext.selectedEvent).toMatchObject({
      id: recentEvent.id,
      name: "Regional 2026",
    });
    expect(loaderData.eventContext.events.map((event) => event.id)).toEqual([
      recentEvent.id,
      olderEvent.id,
    ]);
  });

  test("keeps the portal accessible when there are no Eventos", async () => {
    const loaderData = await loadPortal("http://localhost/portal");

    expect(loaderData.academy).toMatchObject({
      name: "Academia de Prueba",
    });
    expect(loaderData.eventContext).toMatchObject({
      hasEvents: false,
      selectedEvent: null,
      isReadOnly: true,
      isRegistrationOpen: false,
    });
  });
});

describe("portal people list loaders", () => {
  test.each([
    ["Bailarines", bailarinesLoader, "http://localhost/portal/bailarines"],
    ["Profesores", profesoresLoader, "http://localhost/portal/profesores"],
  ])(
    "allows an Academia user to access %s",
    async (_name, routeLoader, url) => {
      const loaderData = await routeLoader({
        request: await createAcademyRequest(url),
      });

      expect(loaderData.academy).toMatchObject({
        name: "Academia de Prueba",
      });
      expect(loaderData.email).toBe("academia@example.com");
    },
  );

  test.each([
    ["Bailarines", bailarinesLoader, "http://localhost/portal/bailarines"],
    ["Profesores", profesoresLoader, "http://localhost/portal/profesores"],
  ])("blocks internal users from %s", async (_name, routeLoader, url) => {
    const response = await expectThrownResponse(
      routeLoader({
        request: await createInternalRequest(url),
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.text()).resolves.toBe(
      "Los usuarios internos no pueden acceder al portal.",
    );
  });
});

async function loadPortal(requestUrl: string) {
  return await portalLoader({
    request: await createAcademyRequest(requestUrl),
    params: {},
    context: {},
    url: new URL(requestUrl),
    pattern: "/portal",
  });
}

async function createAcademyRequest(requestUrl: string) {
  const signUpResult = await auth.api.signUpEmail({
    body: {
      email: "academia@example.com",
      name: "academia@example.com",
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

  await db.insert(academies).values({
    userId: signUpResult.response.user.id,
    name: "Academia de Prueba",
    contactName: "Contacto",
    phone: "11 1234-5678",
  });

  return new Request(requestUrl, {
    headers: {
      cookie: createRequestCookie(signUpResult.headers),
    },
  });
}

async function createInternalRequest(requestUrl: string) {
  const signUpResult = await auth.api.signUpEmail({
    body: {
      email: "admin@example.com",
      name: "admin@example.com",
      password: "password-segura",
    },
    returnHeaders: true,
  });

  await db
    .update(user)
    .set({
      emailVerified: true,
      role: "admin",
    })
    .where(eq(user.id, signUpResult.response.user.id));

  return new Request(requestUrl, {
    headers: {
      cookie: createRequestCookie(signUpResult.headers),
    },
  });
}

async function expectThrownResponse(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    throw error;
  }

  throw new Error("Expected a Response to be thrown.");
}

async function createSavedEvent(
  overrides: Partial<Parameters<typeof createEvent>[0]> = {},
) {
  const result = await createEvent({
    name: "Evento",
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

function createRequestCookie(headers: Headers) {
  const setCookie = headers.get("set-cookie");

  if (!setCookie) {
    throw new Error("Expected Better Auth to return a session cookie.");
  }

  const sessionCookie = setCookie.match(/better-auth\.session_token=([^;]+)/);

  if (!sessionCookie?.[1]) {
    throw new Error("Expected Better Auth to return a session cookie.");
  }

  return `better-auth.session_token=${sessionCookie[1]}`;
}

function date(value: string) {
  return new Date(value);
}
