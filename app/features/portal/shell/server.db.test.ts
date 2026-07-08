import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { user } from "@/db/schema";
import { loadPortalShell } from "@/features/portal/shell/server";
import {
  createAcademySession,
  createRequestCookie,
  expectThrownResponse,
} from "@/features/portal/test-support/db";
import { createLocalAccessUser } from "@/lib/auth/access-test-auth.server";
import { activateEvent } from "@/lib/events/management.server";
import {
  createPortalSavedEvent as createSavedEvent,
  testEventDate as date,
} from "@/lib/events/saved-event-test-support.server";
import { loader as portalIndexLoader } from "@/routes/portal._index";
import { loader as bailarinesLoader } from "@/routes/portal.bailarines";
import { loader as coreografiasLoader } from "@/routes/portal.coreografias";
import { loader as finanzasLoader } from "@/routes/portal.finanzas";
import { loader as perfilLoader } from "@/routes/portal.perfil";
import { loader as profesoresLoader } from "@/routes/portal.profesores";

import { installDatabaseTestHooks } from "../../../../tests/db/harness";

installDatabaseTestHooks();

describe.sequential("portal loader Evento activo", () => {
  test("uses the active Evento in the shell summary", async () => {
    await createSavedEvent({
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

    expect(loaderData.eventContext.activeEvent).toMatchObject({
      id: activeEvent.id,
      name: "Regional 2026",
      active: true,
    });
  });

  test("ignores the event URL query and keeps using the active Evento", async () => {
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

    expect(loaderData.eventContext.activeEvent).toMatchObject({
      id: activeEvent.id,
      name: "Activo",
      active: true,
    });
  });

  test("does not fall back to the most recent Evento when no Evento is active", async () => {
    await createSavedEvent({
      name: "Regional 2025",
      registrationStartsAt: date("2025-03-01T12:00:00Z"),
      registrationEndsAt: date("2025-04-30T12:00:00Z"),
      startsAt: date("2025-05-01T12:00:00Z"),
      endsAt: date("2025-05-03T12:00:00Z"),
    });
    await createSavedEvent({
      name: "Regional 2026",
      startsAt: date("2026-05-01T12:00:00Z"),
      endsAt: date("2026-05-03T12:00:00Z"),
    });

    const loaderData = await loadPortal("http://localhost/portal");

    expect(loaderData.eventContext.activeEvent).toBeNull();
  });

  test("keeps the portal accessible when there are no Eventos", async () => {
    const loaderData = await loadPortal("http://localhost/portal");

    expect(loaderData.academy).toMatchObject({
      name: "Academia de Prueba",
    });
    expect(loaderData.eventContext).toMatchObject({
      activeEvent: null,
    });
  });

  test("allows academy users to load the portal index without dashboard counters", async () => {
    const session = await createAcademySession({
      email: "dashboard@example.com",
      academyName: "Academia Dashboard",
    });

    const loaderData = await portalIndexLoader({
      request: new Request("http://localhost/portal", {
        headers: { cookie: session.cookie },
      }),
      params: {},
      context: {},
      url: new URL("http://localhost/portal"),
      pattern: "/portal",
    });

    expect(loaderData).toBeNull();
  });
});

describe.sequential("portal roster list loaders", () => {
  test.each([
    ["Perfil", perfilLoader, "http://localhost/portal/perfil"],
    ["Finanzas", finanzasLoader, "http://localhost/portal/finanzas"],
    ["Bailarines", bailarinesLoader, "http://localhost/portal/bailarines"],
    [
      "Coreografías",
      coreografiasLoader,
      "http://localhost/portal/coreografias",
    ],
    ["Profesores", profesoresLoader, "http://localhost/portal/profesores"],
  ])(
    "allows an Academia user to access %s",
    async (_name, routeLoader, url) => {
      const loaderData = await routeLoader({
        request: await createAcademyRequest(url),
      });

      expect(loaderData).toBeDefined();
    },
  );

  test.each([
    ["Perfil", perfilLoader, "http://localhost/portal/perfil"],
    ["Finanzas", finanzasLoader, "http://localhost/portal/finanzas"],
    ["Bailarines", bailarinesLoader, "http://localhost/portal/bailarines"],
    [
      "Coreografías",
      coreografiasLoader,
      "http://localhost/portal/coreografias",
    ],
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
  return await loadPortalShell(await createAcademyRequest(requestUrl));
}

async function createAcademyRequest(requestUrl: string) {
  const session = await createAcademySession({
    email: "academia@example.com",
    academyName: "Academia de Prueba",
  });

  return new Request(requestUrl, {
    headers: {
      cookie: session.cookie,
    },
  });
}

async function createInternalRequest(requestUrl: string) {
  const signUpResult = await createLocalAccessUser({
    email: "admin@example.com",
    name: "admin@example.com",
    password: "password-segura",
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
