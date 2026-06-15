import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/auth/internal-navigation.server", () => ({
  requireAdminPanelUser: vi.fn(),
}));

import { AdministracionEventosRouteView } from "@/routes/administracion_.eventos";
import { AdministracionEventoNuevoRouteView } from "@/routes/administracion_.eventos_.nuevo";

describe("administracion/eventos route rendering", () => {
  test("renders an empty Eventos state with a link to create a new Evento", () => {
    const markup = renderRoute({
      email: "admin@example.com",
      events: [],
    });

    expect(markup).toContain("Todavía no hay eventos creados.");
    expect(markup).toContain("/administracion/eventos/nuevo");
    expect(markup).toContain("Nuevo evento");
    expect(markup).not.toContain('name="name"');
    expect(markup).not.toContain('name="requiredDepositPercentage"');
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
          registrationStartsAt: "2027-05-02",
          registrationEndsAt: "2027-05-03",
          startsAt: "2027-05-01",
          endsAt: "2027-05-03",
          requiredDepositPercentage: "30",
        },
      },
    );

    expect(markup).toContain(
      "La inscripción empieza después del inicio del evento.",
    );
    expect(markup).not.toContain('type="time"');
  });
});

function renderRoute(
  loaderData: Partial<
    Parameters<typeof AdministracionEventosRouteView>[0]["loaderData"]
  >,
) {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: ["/administracion/eventos"] },
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
      { initialEntries: ["/administracion/eventos/nuevo"] },
      createElement(AdministracionEventoNuevoRouteView, {
        loaderData: {
          email: "admin@example.com",
          eventOptions: [],
          selectedEventId: null,
          ...loaderData,
        },
        actionData,
      }),
    ),
  );
}
