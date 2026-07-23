/** @vitest-environment jsdom */

import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test } from "vitest";

import { normalizeSearchValue } from "@/components/shared/data-table-helpers";

import {
  AdministracionComprobantesRouteView,
  buildComprobanteFacetedFilters,
  comprobanteColumns,
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
    status: "vigente",
    canAnnul: true,
    choreographyId: "choreo_1",
    choreographyName: "Coreografía Alfa",
    academyId: "academy_1",
    academyName: "Academia Alfa",
    ...overrides,
  };
}

function loaderData(
  rows: AdminComprobanteRow[],
): AdminComprobantesListLoaderData {
  const academyNames = [...new Set(rows.map((row) => row.academyName))];

  return {
    rows,
    academyFacetOptions: academyNames.map((name) => ({
      label: name,
      value: name,
    })),
    selectedEventId: "event_1",
  };
}

// La celda de anulación usa `useFetcher`, que exige un data router: el
// `MemoryRouter` declarativo no alcanza.
function renderView(data: AdminComprobantesListLoaderData) {
  const router = createMemoryRouter(
    [
      {
        path: "/administracion/comprobantes",
        element: <AdministracionComprobantesRouteView loaderData={data} />,
      },
    ],
    { initialEntries: ["/administracion/comprobantes"] },
  );

  return renderToStaticMarkup(<RouterProvider router={router} />);
}

/**
 * Réplica del predicado de faceta del `ClientDataTable` (data-table-core): una
 * fila pasa si, para cada valor seleccionado, alguno de los `filterValue(s)` de
 * sus columnas coincide. Testear contra este contrato verifica que las opciones
 * de faceta y las columnas están cableadas de forma consistente.
 */
function filterByFacets(
  rows: AdminComprobanteRow[],
  selected: Record<string, string>,
) {
  const selectedValues = Object.values(selected).filter(Boolean);

  return rows.filter((row) => {
    const rowValues = comprobanteColumns
      .flatMap(
        (column) =>
          column.filterValues?.(row) ??
          (column.filterValue ? [column.filterValue(row)] : []),
      )
      .filter((value) => value.length > 0);

    return selectedValues.every((selectedValue) =>
      rowValues.some(
        (rowValue) =>
          normalizeSearchValue(rowValue) ===
          normalizeSearchValue(selectedValue),
      ),
    );
  });
}

describe("AdministracionComprobantesRouteView", () => {
  test("renders each comprobante with its number, type, CAE and derived status", () => {
    const markup = renderView(
      loaderData([
        comprobanteRow({ status: "anulada" }),
        comprobanteRow({
          id: "comprobante_2",
          cbteTipo: 13,
          cbteNro: 9,
          academyName: "Academia Beta",
          choreographyName: "Coreografía Beta",
        }),
      ]),
    );

    expect(markup).toContain("0003-00000007");
    expect(markup).toContain("Factura C");
    expect(markup).toContain("Nota de crédito C");
    expect(markup).toContain("11112222333344");
    expect(markup).toContain("Anulada");
    expect(markup).toContain("22/07/2026");
    expect(markup).toContain("Academia Alfa");
    // Enlaza al detalle financiero de la coreografía ancla.
    expect(markup).toContain(
      'href="/administracion/finanzas/academy_1/coreografias/choreo_1"',
    );
    // Enlaza al impreso on-demand del comprobante.
    expect(markup).toContain(
      'href="/administracion/comprobantes/comprobante_1/imprimir"',
    );
  });

  test("offers annulment only on a vigente Factura C", () => {
    const withAnnullable = renderView(
      loaderData([comprobanteRow({ canAnnul: true })]),
    );
    expect(withAnnullable).toContain("Anular");

    // Una factura ya anulada y una nota de crédito no se anulan.
    const withoutAnnullable = renderView(
      loaderData([
        comprobanteRow({ status: "anulada", canAnnul: false }),
        comprobanteRow({ id: "comprobante_2", cbteTipo: 13, canAnnul: false }),
      ]),
    );
    expect(withoutAnnullable).not.toContain("Anular");
  });

  test("renders the empty state when the active event has no comprobantes", () => {
    const markup = renderView(loaderData([]));

    expect(markup).toContain("Todavía no hay comprobantes emitidos.");
  });

  test("exposes estado, tipo and academia faceted filters", () => {
    const filters = buildComprobanteFacetedFilters(
      loaderData([comprobanteRow(), comprobanteRow({ academyName: "Beta" })]),
    );

    expect(filters.map((filter) => filter.label)).toEqual([
      "Estado",
      "Tipo",
      "Academia",
    ]);
    const academiaFilter = filters.find((filter) => filter.id === "academia");
    expect(academiaFilter?.options.map((option) => option.value)).toEqual([
      "Academia Alfa",
      "Beta",
    ]);
  });

  test("estado facet keeps only comprobantes with the selected derived status", () => {
    const rows = [
      comprobanteRow({ id: "vigente_1", status: "vigente" }),
      comprobanteRow({ id: "anulada_1", status: "anulada" }),
    ];

    const anuladas = filterByFacets(rows, { estado: "anulada" });

    expect(anuladas.map((row) => row.id)).toEqual(["anulada_1"]);
  });

  test("tipo facet keeps only comprobantes of the selected voucher type", () => {
    const rows = [
      comprobanteRow({ id: "factura_1", cbteTipo: 11 }),
      comprobanteRow({ id: "nota_1", cbteTipo: 13 }),
    ];

    const notas = filterByFacets(rows, { tipo: "Nota de crédito C" });

    expect(notas.map((row) => row.id)).toEqual(["nota_1"]);
  });

  test("academia facet and combined facets narrow the rows", () => {
    const rows = [
      comprobanteRow({
        id: "alfa_vigente",
        academyName: "Academia Alfa",
        status: "vigente",
      }),
      comprobanteRow({
        id: "alfa_anulada",
        academyName: "Academia Alfa",
        status: "anulada",
      }),
      comprobanteRow({
        id: "beta_vigente",
        academyName: "Academia Beta",
        status: "vigente",
      }),
    ];

    expect(
      filterByFacets(rows, { academia: "Academia Alfa" }).map((row) => row.id),
    ).toEqual(["alfa_vigente", "alfa_anulada"]);
    expect(
      filterByFacets(rows, {
        academia: "Academia Alfa",
        estado: "anulada",
      }).map((row) => row.id),
    ).toEqual(["alfa_anulada"]);
  });
});
