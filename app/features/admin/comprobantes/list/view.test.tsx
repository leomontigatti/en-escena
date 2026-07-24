/** @vitest-environment jsdom */

import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, test } from "vitest";

import {
  AdministracionComprobantesRouteView,
  comprobanteColumns,
  comprobanteFacetedFilters,
} from "./view";
import type {
  AdminComprobanteRow,
  AdminComprobantesListLoaderData,
} from "./server";

function comprobanteRow(
  overrides: Partial<AdminComprobanteRow> = {},
): AdminComprobanteRow {
  return {
    id: "comprobante_1",
    cbteTipo: 11,
    ptoVta: 3,
    cbteNro: 7,
    cbteFch: "20260722",
    impTotal: 25000,
    cae: "11112222333344",
    porcion: "seña",
    status: "vigente",
    choreographyId: "choreo_1",
    choreographyName: "Coreografía Alfa",
    academyId: "academy_1",
    academyName: "Academia Alfa",
    ...overrides,
  };
}

function loaderData(
  overrides: Partial<AdminComprobantesListLoaderData> = {},
): AdminComprobantesListLoaderData {
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

function renderView(data: AdminComprobantesListLoaderData) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={["/administracion/comprobantes"]}>
      <AdministracionComprobantesRouteView loaderData={data} />
    </MemoryRouter>,
  );
}

describe("AdministracionComprobantesRouteView", () => {
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
            choreographyName: "Coreografía Beta",
          }),
        ],
      }),
    );

    expect(markup).toContain("0003-00000007");
    // El badge de Tipo muestra sólo las iniciales; el label completo queda en title.
    expect(markup).toContain("FC");
    expect(markup).toContain("NC");
    expect(markup).toContain('title="Factura C"');
    expect(markup).toContain('title="Nota de crédito C"');
    expect(markup).toContain("Anulada");
    expect(markup).toContain("22/07/2026");
    expect(markup).toContain("Academia Alfa");
    // El número enlaza al detalle del comprobante (superficie de solo lectura).
    expect(markup).toContain(
      'href="/administracion/comprobantes/comprobante_1"',
    );
    // La coreografía enlaza a su detalle financiero.
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

  test("orders the columns as número, tipo, academia, coreografía, estado, fecha, importe", () => {
    expect(comprobanteColumns.map((column) => column.id)).toEqual([
      "numero",
      "tipo",
      "academia",
      "coreografia",
      "estado",
      "fecha",
      "importe",
    ]);

    expect(comprobanteColumns.map((column) => column.header)).toEqual([
      "Comprobante",
      "Tipo",
      "Academia",
      "Coreografía",
      "Estado",
      "Fecha",
      "Importe",
    ]);
  });

  test("only número and fecha are sortable", () => {
    const sortable = comprobanteColumns
      .filter((column) => Boolean(column.sortValue))
      .map((column) => column.id);

    expect(sortable).toEqual(["numero", "fecha"]);
  });

  test("exposes only estado and tipo faceted filters (academia and porción are gone)", () => {
    expect(comprobanteFacetedFilters.map((filter) => filter.label)).toEqual([
      "Estado",
      "Tipo",
    ]);
    expect(comprobanteFacetedFilters.map((filter) => filter.id)).not.toContain(
      "academia",
    );
    expect(comprobanteFacetedFilters.map((filter) => filter.id)).not.toContain(
      "porcion",
    );

    const estado = comprobanteFacetedFilters.find(
      (filter) => filter.id === "estado",
    );
    expect(estado?.options.map((option) => option.value)).toEqual([
      "vigente",
      "anulada",
    ]);

    const tipo = comprobanteFacetedFilters.find(
      (filter) => filter.id === "tipo",
    );
    expect(tipo?.options.map((option) => option.value)).toEqual([
      "factura_c",
      "nota_credito_c",
    ]);
  });

  test("searches by academia, coreografía and número", () => {
    const markup = renderView(loaderData({ rows: [comprobanteRow()] }));

    expect(markup).toContain(
      'placeholder="Buscar por academia, coreografía o número"',
    );
  });

  test("renders the empty state when the active event has no comprobantes", () => {
    const markup = renderView(loaderData());

    expect(markup).toContain("Todavía no hay comprobantes emitidos.");
  });
});
