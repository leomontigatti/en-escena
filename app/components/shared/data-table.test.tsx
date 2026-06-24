/** @vitest-environment jsdom */

import "@/test/react-test-env";

import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import {
  buildDataTableFilterHref,
  buildDataTablePageHref,
  buildDataTableSearchHref,
  buildDataTableSortHref,
  DataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";

type Row = {
  id: string;
  academy: string;
  name: string;
  status: "active" | "archived";
};

const columns: DataTableColumn<Row>[] = [
  {
    id: "name",
    header: "Nombre",
    cell: (row) => row.name,
    filterValue: (row) => row.name,
    sortValue: (row) => row.name,
  },
  {
    id: "academy",
    header: "Academia",
    cell: (row) => row.academy,
    filterValue: (row) => row.academy,
  },
  {
    id: "status",
    header: "Estado",
    cell: (row) => (row.status === "active" ? "Activo" : "Archivado"),
    filterValue: (row) => (row.status === "active" ? "Activo" : "Archivado"),
    filterValues: (row) => [row.status],
  },
  {
    id: "filters",
    header: "Filtros",
    cell: () => null,
    hidden: true,
    filterValues: (row) => [row.status],
  },
];

describe("DataTable", () => {
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
      root = null;
    }

    container?.remove();
    container = null;
  });

  test("renders client-side faceted filters without initial values", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <MemoryRouter initialEntries={["/administracion/eventos"]}>
          <DataTable
            mode="client"
            rows={[
              {
                id: "event_1",
                academy: "En Escena",
                name: "Evento Nacional",
                status: "active",
              },
            ]}
            columns={columns}
            getRowKey={(row) => row.id}
            searchPlaceholder="Buscar evento por nombre"
            textFilterColumnId="name"
            facetedFilters={[
              {
                columnId: "filters",
                label: "Filtros",
                groups: [
                  {
                    label: "Estado",
                    options: [
                      { label: "Activo", value: "active" },
                      { label: "Archivado", value: "archived" },
                    ],
                  },
                ],
              },
            ]}
          />
        </MemoryRouter>,
      );
    });

    expect(container.textContent).toContain("Evento Nacional");
    const tableHeaders = Array.from(container.querySelectorAll("th")).map(
      (header) => header.textContent,
    );
    expect(tableHeaders).not.toContain("Filtros");
    expect(container.textContent).toContain("1 de 1 registro");
  });

  test("renders server-side search, active filters, loading state, and real pagination targets", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter
        initialEntries={[
          "/administracion/profesores?q=Ana&estado=archivados&page=2",
        ]}
      >
        <DataTable
          mode="server"
          rows={[
            {
              id: "professor_1",
              academy: "Academia Norte",
              name: "Ana Participa",
              status: "archived",
            },
          ]}
          columns={columns}
          getRowKey={(row) => row.id}
          searchPlaceholder="Buscar profesor por nombre, número de documento o academia"
          initialSearchValue="Ana"
          facetedFilters={[
            {
              columnId: "filters",
              label: "Filtros",
              groups: [
                {
                  id: "estado",
                  label: "Estado",
                  options: [
                    { label: "Activos", value: "activos" },
                    { label: "Archivados", value: "archivados" },
                    { label: "Todos", value: "todos" },
                  ],
                },
              ],
            },
          ]}
          initialFacetedFilterValues={{
            filters: {
              estado: "archivados",
            },
          }}
          initialSort={{
            columnId: "name",
            direction: "asc",
          }}
          currentPage={2}
          totalPages={3}
          totalRows={53}
          loading
        />
      </MemoryRouter>,
    );

    expect(markup).toContain('value="Ana"');
    expect(markup).toContain('aria-label="Filtros: Estado: Archivados"');
    expect(markup).toContain(
      'href="/administracion/profesores?q=Ana&amp;estado=archivados&amp;orden=name%3Adesc"',
    );
    expect(markup).toContain(">1<");
    expect(markup).toContain("Actualizando");
    expect(markup).toContain(
      'href="/administracion/profesores?q=Ana&amp;estado=archivados"',
    );
    expect(markup).toContain(
      'href="/administracion/profesores?q=Ana&amp;estado=archivados&amp;page=2"',
    );
    expect(markup).toContain(
      'href="/administracion/profesores?q=Ana&amp;estado=archivados&amp;page=3"',
    );
  });

  test("preserves client-side filtering behavior when server-side mode is not enabled", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/portal/profesores"]}>
        <DataTable
          mode="client"
          rows={[
            {
              id: "professor_1",
              academy: "Academia Norte",
              name: "Ana Participa",
              status: "active",
            },
            {
              id: "professor_2",
              academy: "Academia Sur",
              name: "Beto Consulta",
              status: "active",
            },
          ]}
          columns={columns}
          getRowKey={(row) => row.id}
          searchPlaceholder="Buscar profesor por nombre, número de documento o academia"
          textFilterColumnId="name"
        />
      </MemoryRouter>,
    );

    expect(markup).toContain("Ana Participa");
    expect(markup).toContain("Beto Consulta");
    expect(markup).toContain("Buscar en la tabla");
    expect(markup).toContain("2 de 2 registros");
  });

  test("applies client-side base faceted filters without showing an active filter badge", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/portal/profesores"]}>
        <DataTable
          mode="client"
          rows={[
            {
              id: "professor_1",
              academy: "Academia Norte",
              name: "Ana Activa",
              status: "active",
            },
            {
              id: "professor_2",
              academy: "Academia Norte",
              name: "Beto Archivado",
              status: "archived",
            },
          ]}
          columns={columns}
          getRowKey={(row) => row.id}
          searchPlaceholder="Buscar en la tabla"
          textFilterColumnId="name"
          facetedFilters={[
            {
              columnId: "status",
              label: "Filtros",
              groups: [
                {
                  id: "archivo",
                  label: "Archivo",
                  options: [{ label: "Archivado", value: "archived" }],
                },
              ],
            },
          ]}
          baseFacetedFilterValues={{
            status: {
              archivo: "active",
            },
          }}
        />
      </MemoryRouter>,
    );

    expect(markup).toContain("Ana Activa");
    expect(markup).not.toContain("Beto Archivado");
    expect(markup).toContain("1 de 2 registros");
    expect(markup).toContain('aria-label="Filtros"');
    expect(markup).not.toContain('aria-label="Filtros:');
  });
});

describe("DataTable server-side href helpers", () => {
  test("builds debounced search targets by preserving active filters and clearing page 1", () => {
    expect(
      buildDataTableSearchHref({
        basePath: "/administracion/profesores",
        currentSearch: "?q=Ana&estado=archivados&page=2",
        searchValue: "Beto",
      }),
    ).toBe("/administracion/profesores?q=Beto&estado=archivados");

    expect(
      buildDataTableSearchHref({
        basePath: "/administracion/profesores",
        currentSearch: "?q=Ana&estado=archivados&page=2",
        searchValue: "",
      }),
    ).toBe("/administracion/profesores?estado=archivados");
  });

  test("builds filter targets by clearing active params and resetting pagination", () => {
    expect(
      buildDataTableFilterHref({
        basePath: "/administracion/profesores",
        currentSearch: "?q=Ana&estado=archivados&page=2",
        filter: {
          columnId: "filters",
          label: "Filtros",
          groups: [
            {
              id: "estado",
              label: "Estado",
              options: [],
            },
          ],
        },
        values: {},
      }),
    ).toBe("/administracion/profesores?q=Ana");
  });

  test("builds pagination targets that preserve active query params", () => {
    expect(
      buildDataTablePageHref({
        basePath: "/administracion/profesores",
        currentSearch: "?q=Ana&estado=archivados&page=2",
        page: 1,
      }),
    ).toBe("/administracion/profesores?q=Ana&estado=archivados");

    expect(
      buildDataTablePageHref({
        basePath: "/administracion/profesores",
        currentSearch: "?q=Ana&estado=archivados&page=2",
        page: 3,
      }),
    ).toBe("/administracion/profesores?q=Ana&estado=archivados&page=3");
  });

  test("builds sort targets by preserving active params and clearing page 1", () => {
    expect(
      buildDataTableSortHref({
        basePath: "/administracion/profesores",
        columnId: "nombre",
        currentSearch: "?q=Ana&estado=archivados&page=2",
        direction: "desc",
      }),
    ).toBe(
      "/administracion/profesores?q=Ana&estado=archivados&orden=nombre%3Adesc",
    );
  });
});
