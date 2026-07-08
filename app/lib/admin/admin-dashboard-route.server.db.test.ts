import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, test } from "vitest";

import { createSignedInAdminRequest as createSignedInRequest } from "@/lib/admin/test-support/db";
import { activateEvent } from "@/lib/events/management.server";
import { createAdminSavedEvent as createSavedEvent } from "@/lib/events/saved-event-test-support.server";
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

function routeArgs(request: Request) {
  return {
    request,
    params: {},
    context: {},
    url: new URL(request.url),
    pattern: "/administracion",
  };
}
