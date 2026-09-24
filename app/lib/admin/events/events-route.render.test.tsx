import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/auth/internal-navigation.server", () => ({
  requireAdminPanelUser: vi.fn(),
}));

import type { EventListRow } from "@/features/admin/events/list/shared";
import { defaultEventFormValues } from "@/lib/admin/events/form-values";
import { EventsListRouteView } from "@/routes/administracion.eventos";
import { NewEventRouteView } from "@/routes/administracion.eventos_.nuevo";

describe("`/administracion/eventos` route rendering", () => {
  test("renders an empty events state with a link to create a new event", () => {
    const markup = renderRoute({
      events: [],
    });

    expect(markup).toContain("Todavía no hay eventos creados.");
    expect(markup).toContain("/administracion/eventos/nuevo");
    expect(markup).toContain("Nuevo evento");
    expect(markup).not.toContain('name="name"');
    expect(markup).not.toContain('name="requiredDepositPercentage"');
  });

  // The two dates of the event read as the schedules list reads a date, one
  // column each; inscriptions are per `Cronograma` and say nothing here.
  test("renders the event dates as two long-format columns and nothing about inscriptions", () => {
    const markup = renderRoute({ events: [eventListRow()] });

    expect(markup).toContain("Fecha de inicio");
    expect(markup).toContain("Fecha de finalización");
    expect(markup).toContain("12 de abril de 2026");
    expect(markup).toContain("14 de abril de 2026");
    expect(markup).not.toContain("Inscripción");
  });

  // The dates are days, not moments: the form must never offer a time input.
  test("renders the event form with date-only fields", () => {
    const markup = renderCreateRoute({
      status: "error",
      message: "Revisá los datos del evento.",
      fieldErrors: {},
      values: {
        ...defaultEventFormValues(),
        name: "Evento sin inscripciones",
        startsAt: "2027-05-01",
        endsAt: "2027-05-03",
        requiredDepositPercentage: "30",
      },
    });

    expect(markup).toContain('name="startsAt"');
    expect(markup).not.toContain('name="registrationStartsAt"');
    expect(markup).not.toContain('type="time"');
  });
});

/** One row of the list, with the dates the two columns are read through. */
function eventListRow(): EventListRow {
  return {
    id: "event_1",
    name: "En Escena 2026",
    active: true,
    programVisible: false,
    resultsVisible: false,
    requiredDepositPercentage: 30,
    startsAt: new Date("2026-04-12T15:00:00.000Z"),
    endsAt: new Date("2026-04-14T15:00:00.000Z"),
    registrationReady: true,
    registrationReadinessMissingItems: [],
    registrationReadinessDirty: false,
    registrationReadinessCalculatedAt: null,
    paymentInstructionsCbu: null,
    paymentInstructionsAlias: null,
    paymentInstructionsHolderName: null,
    paymentInstructionsBankName: null,
    paymentInstructionsHolderCuit: null,
    paymentInstructionsText: null,
    createdAt: new Date("2026-01-01T15:00:00.000Z"),
    isRegistrationReady: true,
    shouldShowRegistrationReadiness: true,
    temporalState: { label: "No iniciado", value: "not-started" },
  };
}

function renderRoute(
  loaderData: Partial<Parameters<typeof EventsListRouteView>[0]["loaderData"]>,
) {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: ["/administracion/eventos"] },
      createElement(EventsListRouteView, {
        loaderData: {
          events: [],
          ...loaderData,
        },
      }),
    ),
  );
}

function renderCreateRoute(
  actionData?: Parameters<typeof NewEventRouteView>[0]["actionData"],
) {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: ["/administracion/eventos/nuevo"] },
      createElement(NewEventRouteView, {
        actionData,
      }),
    ),
  );
}
