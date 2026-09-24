import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, test } from "vitest";

import type { EventProgramRow } from "@/lib/presentations/event-program.server";

import type { PublicProgramLoaderData } from "./server";
import { PublicProgramView } from "./view";

describe("PublicProgramView", () => {
  test("renders the same not-published state with no event and with a hidden program", () => {
    const markup = renderView({ event: null, rows: [], schedules: [] });

    expect(markup).toContain("No hay programa publicado");
    expect(markup).toContain(
      "La organización todavía no publicó el programa del evento. Volvé a consultar más cerca de la fecha.",
    );
    // Nothing on the page tells the two cases apart.
    expect(markup).not.toContain("Programa</h1>");
    expect(markup).not.toContain("Imprimir");
  });

  test("names the event, its days and the caveat above the list", () => {
    const markup = renderView();

    expect(markup).toContain("Programa");
    expect(markup).toContain("En Escena 2026, del 1 de mayo de 2026 al ");
    expect(markup).toContain("3 de mayo de 2026");
    expect(markup).toContain(
      "El orden de las presentaciones puede cambiar hasta el día del evento.",
    );
    expect(markup).toContain("Imprimir");
  });

  test("points the top bar at the portal only when an academy is signed in", () => {
    expect(renderView({ hasAcademySession: true })).toContain("Ir al portal");
    expect(renderView({ hasAcademySession: true })).not.toContain("Ingresar");

    const anonymous = renderView({ hasAcademySession: false });

    expect(anonymous).toContain("Ingresar");
    expect(anonymous).toContain("/ingresar");
    expect(anonymous).not.toContain("Ir al portal");
  });

  test("renders the list with the academy column, no state and the wider search", () => {
    const markup = renderView();

    for (const header of [
      "N.º",
      "Categoría / Tipo de grupo",
      "Modalidad / Submodalidad",
      "Academia",
      "Nombre",
      "Bailarines",
    ]) {
      expect(markup).toContain(header);
    }

    expect(markup).toContain(
      "Buscar por número de presentación, nombre o academia",
    );
    expect(markup).not.toContain(">Estado<");
    // The name is plain text here: nowhere public to link a choreography to.
    expect(markup).not.toContain("/portal/coreografias/");
  });

  test("prints one page run per schedule, each under its own heading", () => {
    const markup = renderView({
      rows: [
        buildRow({ choreographyId: "one", orderNumber: 1 }),
        buildRow({
          choreographyId: "two",
          orderNumber: 2,
          scheduleId: "schedule-2",
          scheduledDate: "2026-05-02",
        }),
      ],
      schedules: [
        {
          id: "schedule-1",
          name: "Sábado mañana",
          scheduledDate: "2026-05-01",
          startTime: "10:00",
        },
        {
          id: "schedule-2",
          name: "Domingo tarde",
          scheduledDate: "2026-05-02",
          startTime: "16:00",
        },
      ],
    });

    expect(markup).toContain(
      "En Escena 2026 · viernes 1 de mayo 10:00 hs · Sábado mañana",
    );
    expect(markup).toContain(
      "En Escena 2026 · sábado 2 de mayo 16:00 hs · Domingo tarde",
    );
    // The headings run once per schedule, and so do the print column headers.
    expect(countOccurrences(markup, "Categoría</th>")).toBe(2);
    expect(countOccurrences(markup, "break-before-page")).toBe(1);
    expect(markup).toContain("break-inside-avoid");
    expect(markup).toContain("@page { size: A4 landscape; margin: 0; }");
    expect(countOccurrences(markup, "12mm")).toBeGreaterThanOrEqual(4);
  });

  // A date that is a shape and not a day —`2026-13-40`— throws when formatted,
  // and on the only unauthenticated route in the product that would take the
  // whole page down rather than one heading.
  test("keeps printing when a schedule's date is not a day", () => {
    const markup = renderView({
      rows: [buildRow({ scheduledDate: "2026-13-40" })],
      schedules: [
        {
          id: "schedule-1",
          name: "Sábado mañana",
          scheduledDate: "2026-13-40",
          startTime: "10:00",
        },
      ],
    });

    expect(markup).toContain(
      "En Escena 2026 · 2026-13-40 10:00 hs · Sábado mañana",
    );
  });
});

function countOccurrences(markup: string, needle: string) {
  return markup.split(needle).length - 1;
}

function buildRow(overrides: Partial<EventProgramRow> = {}): EventProgramRow {
  return {
    academyName: "Academia Sur",
    categoryName: "Infantil",
    choreographyId: "choreography-1",
    choreographyNumber: 12,
    dancerNames: ["Ana Paz"],
    groupType: "solo",
    isBelowDeposit: false,
    levelLabel: "Amateur",
    modalityName: "Jazz",
    name: "Pieza",
    orderNumber: 1,
    scheduleId: "schedule-1",
    scheduledDate: "2026-05-01",
    submodalityName: null,
    ...overrides,
  };
}

function renderView(overrides: Partial<PublicProgramLoaderData> = {}) {
  const loaderData: PublicProgramLoaderData = {
    event: {
      endsOn: "2026-05-03",
      name: "En Escena 2026",
      startsOn: "2026-05-01",
    },
    hasAcademySession: false,
    rows: [buildRow()],
    schedules: [
      {
        id: "schedule-1",
        name: "Sábado mañana",
        scheduledDate: "2026-05-01",
        startTime: "10:00",
      },
    ],
    ...overrides,
  };

  return renderToStaticMarkup(
    <MemoryRouter initialEntries={["/programa"]}>
      <PublicProgramView loaderData={loaderData} />
    </MemoryRouter>,
  );
}
