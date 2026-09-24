import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, test } from "vitest";

import { createSignedInAdminRequest as createSignedInRequest } from "@/lib/admin/test-support/db";
import { createOpenEventCatalog } from "@/lib/choreographies/registration-test-fixtures.server.db";
import { activateEvent } from "@/lib/events/management.server";
import { createAdminSavedEvent as createSavedEvent } from "@/lib/events/saved-event-test-support.server";
import { DashboardRouteView, loader } from "@/routes/administracion._index";

import { db } from "@/db";
import { schedules } from "@/db/schema";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

describe("`/administracion` index route", () => {
  test("shows an alert when the active event is not ready for choreography registration", async () => {
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

  test("does not show the bases alert when there is no active event", async () => {
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

  test("warns when a schedule takes inscriptions while the event is not ready", async () => {
    const event = await createSavedEvent({ name: "En Escena 2026" });
    await activateEvent(event.id);
    // Opened before the bases lost an item: nothing auto-closes it, so the two
    // facts have to read together on the dashboard.
    await insertOpenSchedule(event.id);
    const { request } = await createSignedInRequest({
      email: "admin.dashboard.open.unready@example.com",
      role: "admin",
      requestUrl: "http://localhost/administracion",
    });

    const data = await loader(routeArgs(request));
    const markup = renderRoute(data);

    expect(data.isRegistrationOpen).toBe(true);
    expect(data.activeEventRegistrationReadiness?.isReady).toBe(false);
    expect(markup).toContain(
      "Hay cronogramas con las inscripciones abiertas y bases sin configurar.",
    );
    expect(markup).toContain("/administracion/cronogramas");
    await expect(openScheduleCount(event.id)).resolves.toBe(1);
  });

  test("does not warn when the open schedules belong to a ready event", async () => {
    const { event } = await createOpenEventCatalog();
    const { request } = await createSignedInRequest({
      email: "admin.dashboard.open.ready@example.com",
      role: "admin",
      requestUrl: "http://localhost/administracion",
    });

    const data = await loader(routeArgs(request));
    const markup = renderRoute(data);

    expect(data.activeEvent?.id).toBe(event.id);
    expect(data.isRegistrationOpen).toBe(true);
    expect(data.activeEventRegistrationReadiness?.isReady).toBe(true);
    expect(markup).not.toContain("bases sin configurar");
  });

  test("does not warn when the event is not ready and every schedule is closed", async () => {
    const event = await createSavedEvent({ name: "En Escena 2026" });
    await activateEvent(event.id);
    const { request } = await createSignedInRequest({
      email: "admin.dashboard.closed.unready@example.com",
      role: "admin",
      requestUrl: "http://localhost/administracion",
    });

    const data = await loader(routeArgs(request));
    const markup = renderRoute(data);

    expect(data.isRegistrationOpen).toBe(false);
    expect(data.activeEventRegistrationReadiness?.isReady).toBe(false);
    expect(markup).not.toContain("bases sin configurar");
  });
});

function renderRoute(
  loaderData: Parameters<typeof DashboardRouteView>[0]["loaderData"],
) {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      {
        initialEntries: ["/administracion"],
      },
      createElement(DashboardRouteView, {
        loaderData,
      }),
    ),
  );
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

async function insertOpenSchedule(eventId: string) {
  const [schedule] = await db
    .insert(schedules)
    .values({
      eventId,
      name: "Primer bloque",
      scheduledDate: "2026-05-01",
      startTime: "10:00",
      totalCapacity: 10,
      registrationOpen: true,
    })
    .returning();

  return schedule;
}

async function openScheduleCount(eventId: string) {
  const rows = await db.query.schedules.findMany({
    columns: { id: true },
    where: (table, { and, eq }) =>
      and(eq(table.eventId, eventId), eq(table.registrationOpen, true)),
  });

  return rows.length;
}
