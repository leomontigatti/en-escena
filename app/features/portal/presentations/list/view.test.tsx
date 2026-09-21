import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, test } from "vitest";

import type { ProgramListRow } from "@/features/program/shared";

import { PortalPresentationsListView } from "./view";
import type { PortalPresentationsLoaderData } from "./server";

describe("PortalPresentationsListView", () => {
  test("shows the empty state when there is no active event", () => {
    const markup = renderView({
      hasActiveEvent: false,
      isEventOrdered: false,
      rows: [],
    });

    expect(markup).toContain("No hay un evento activo");
    expect(markup).toContain(
      "Cuando la organización active un evento vas a ver acá las presentaciones de tu academia.",
    );
  });

  test("shows the empty state when the event has not been ordered yet", () => {
    const markup = renderView({ isEventOrdered: false });

    expect(markup).toContain("Todavía no hay orden de presentaciones");
    expect(markup).toContain(
      "Cuando la organización ordene el evento vas a ver acá el número de cada coreografía.",
    );
  });

  test("shows the empty state when the academy has nothing in the order", () => {
    const markup = renderView({ rows: [] });

    expect(markup).toContain("Tu academia no tiene presentaciones");
    expect(markup).toContain(
      "Una coreografía entra en el programa cuando cubre su seña.",
    );
  });

  test("links to the full program only while it is published", () => {
    expect(renderView({ programVisible: true })).toContain(
      "Ver programa completo",
    );
    expect(renderView({ programVisible: false })).not.toContain(
      "Ver programa completo",
    );
  });

  test("warns that the numbers can still change while the program is hidden", () => {
    expect(renderView({ programVisible: false })).toContain(
      "El programa del evento todavía no se publicó. Los números pueden cambiar hasta que la organización lo publique.",
    );
    expect(renderView({ programVisible: true })).not.toContain(
      "El programa del evento todavía no se publicó",
    );
  });

  test("counts the choreographies that still owe their deposit and links to the finances", () => {
    const singular = renderView({
      rows: [buildRow({ isBelowDeposit: true })],
    });

    expect(singular).toContain("Existe 1 coreografía con la seña pendiente.");
    expect(singular).toContain("Ver finanzas");
    expect(singular).toContain("/portal/finanzas");

    const plural = renderView({
      rows: [
        buildRow({ choreographyId: "one", isBelowDeposit: true }),
        buildRow({ choreographyId: "two", isBelowDeposit: true }),
      ],
    });

    expect(plural).toContain("Existen 2 coreografías con la seña pendiente.");

    expect(renderView({ rows: [buildRow()] })).not.toContain(
      "con la seña pendiente",
    );
  });

  test("badges the pending deposit ahead of the missing number and nothing else", () => {
    const markup = renderView({
      rows: [
        buildRow({
          choreographyId: "late",
          isBelowDeposit: true,
          orderNumber: null,
        }),
        buildRow({ choreographyId: "waiting", orderNumber: null }),
        buildRow({ choreographyId: "numbered", orderNumber: 3 }),
      ],
    });

    expect(markup).toContain("Seña pendiente");
    expect(markup).toContain("Sin número");
    expect(markup).not.toContain("Fuera de bloque");
    expect(markup).not.toContain("Separación");
  });

  test("renders the documented columns, the day tabs and the search placeholder", () => {
    const markup = renderView({
      rows: [
        buildRow({ choreographyId: "one", scheduledDate: "2026-05-01" }),
        buildRow({ choreographyId: "two", scheduledDate: "2026-05-02" }),
      ],
    });

    for (const header of [
      "N.º",
      "Categoría / Tipo de grupo",
      "Modalidad / Submodalidad",
      "Nombre",
      "Bailarines",
      "Estado",
    ]) {
      expect(markup).toContain(header);
    }

    expect(markup).not.toContain(">Academia<");
    expect(markup).toContain("Buscar por número de presentación o nombre");
    expect(markup).toContain("Todos");
    expect(markup).toContain("1 de mayo de 2026");
    expect(markup).toContain("2 de mayo de 2026");
  });

  test("links a name to the academy's own choreography detail", () => {
    const markup = renderView({
      rows: [buildRow({ choreographyId: "choreography-1" })],
    });

    expect(markup).toContain("/portal/coreografias/choreography-1");
  });
});

function buildRow(overrides: Partial<ProgramListRow> = {}): ProgramListRow {
  return {
    academyName: "Academia Sur",
    categoryName: "Infantil",
    choreographyId: "choreography-1",
    choreographyNumber: 12,
    dancerNames: ["Ana Paz"],
    groupType: "solo",
    isBelowDeposit: false,
    modalityName: "Jazz",
    name: "Pieza",
    orderNumber: 1,
    scheduledDate: "2026-05-01",
    submodalityName: null,
    ...overrides,
  };
}

function renderView(overrides: Partial<PortalPresentationsLoaderData> = {}) {
  const loaderData: PortalPresentationsLoaderData = {
    hasActiveEvent: true,
    isEventOrdered: true,
    programVisible: false,
    rows: [buildRow()],
    ...overrides,
  };

  return renderToStaticMarkup(
    <MemoryRouter initialEntries={["/portal/presentaciones"]}>
      <PortalPresentationsListView loaderData={loaderData} />
    </MemoryRouter>,
  );
}
