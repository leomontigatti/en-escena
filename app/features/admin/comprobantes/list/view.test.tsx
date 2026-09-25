/** @vitest-environment jsdom */

import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, test } from "vitest";

import { ComprobantesListRouteView } from "./view";
import type { ComprobantesListRow, ComprobantesListLoaderData } from "./server";

function comprobanteRow(
  overrides: Partial<ComprobantesListRow> = {},
): ComprobantesListRow {
  return {
    id: "comprobante_1",
    cbteTipo: 11,
    ptoVta: 3,
    cbteNro: 7,
    cbteFch: "20260722",
    impTotal: 25000,
    cae: "11112222333344",
    status: "vigente",
    anchor: {
      kind: "choreography",
      choreographyId: "choreo_1",
      choreographyName: "Coreografía Alfa",
    },
    academyId: "academy_1",
    academyName: "Academia Alfa",
    ...overrides,
  };
}

function loaderData(
  overrides: Partial<ComprobantesListLoaderData> = {},
): ComprobantesListLoaderData {
  const rows = overrides.rows ?? [];

  return {
    filters: {
      estado: null,
      order: { columnId: "fecha", direction: "desc" },
      page: 1,
      query: "",
      tipo: null,
    },
    hasAnyComprobante: rows.length > 0,
    rows,
    selectedEventId: "event_1",
    totalCount: rows.length,
    totalPages: 1,
    ...overrides,
  };
}

function renderView(data: ComprobantesListLoaderData) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={["/administracion/comprobantes"]}>
      <ComprobantesListRouteView loaderData={data} />
    </MemoryRouter>,
  );
}

describe("ComprobantesListRouteView", () => {
  test("renders each comprobante with its number, initials-only type badge and derived status", () => {
    const markup = renderView(
      loaderData({
        rows: [
          comprobanteRow({ status: "anulada" }),
          comprobanteRow({
            id: "comprobante_2",
            cbteTipo: 13,
            cbteNro: 9,
            academyName: "Academia Beta",
            anchor: {
              kind: "choreography",
              choreographyId: "choreo_2",
              choreographyName: "Coreografía Beta",
            },
          }),
        ],
      }),
    );

    expect(markup).toContain("0003-00000007");
    // The type badge shows only the initials; the full label stays in the title.
    expect(markup).toContain("FC");
    expect(markup).toContain("NC");
    expect(markup).toContain('title="Factura C"');
    expect(markup).toContain('title="Nota de crédito C"');
    expect(markup).toContain("Anulada");
    expect(markup).toContain("22/07/2026");
    expect(markup).toContain("Academia Alfa");
    // The number links to the comprobante detail (a read-only surface).
    expect(markup).toContain(
      'href="/administracion/comprobantes/comprobante_1"',
    );
    // The choreography links to its financial detail.
    expect(markup).toContain(
      'href="/administracion/finanzas/academy_1/coreografias/choreo_1"',
    );
  });

  test("is read-only: no CAE column and no inline imprimir/anular actions", () => {
    const markup = renderView(loaderData({ rows: [comprobanteRow()] }));

    expect(markup).not.toContain("11112222333344");
    expect(markup).not.toContain("Imprimir");
    expect(markup).not.toContain("Anular");
    expect(markup).not.toContain(
      'href="/administracion/comprobantes/comprobante_1/imprimir"',
    );
  });

  test("a seminar comprobante reads its unit as the instructor and the date, linked to the `(seminar, academy)` detail", () => {
    const markup = renderView(
      loaderData({
        rows: [
          comprobanteRow({
            anchor: {
              kind: "seminar",
              seminarId: "seminar_1",
              instructorName: "Abril Sosa",
              scheduledDate: "2030-10-10",
            },
          }),
        ],
      }),
    );

    expect(markup).toContain("Seminario Abril Sosa, 10/10/2030");
    expect(markup).toContain(
      'href="/administracion/finanzas/academy_1/seminarios/seminar_1"',
    );
  });
});
