import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, test } from "vitest";

import {
  buildDataTableFilterHref,
  buildDataTablePageHref,
  buildDataTableSearchHref,
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
    header: "Profesor",
    cell: (row) => row.name,
    filterValue: (row) => row.name,
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
  },
];

describe("DataTable", () => {
  test("renders server-side search, active filters, loading state, and real pagination targets", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter
        initialEntries={[
          "/administracion/profesores?q=Ana&estado=archivados&page=2",
        ]}
      >
        <DataTable
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
          searchPlaceholder="Buscar por nombre, documento o academia"
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
          serverSide={{
            currentPage: 2,
            totalPages: 3,
            totalRows: 53,
            loading: true,
          }}
        />
      </MemoryRouter>,
    );

    expect(markup).toContain('value="Ana"');
    expect(markup).toContain('aria-label="Filtros: Estado: Archivados"');
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
          searchPlaceholder="Buscar en la tabla"
          textFilterColumnId="name"
        />
      </MemoryRouter>,
    );

    expect(markup).toContain("Ana Participa");
    expect(markup).toContain("Beto Consulta");
    expect(markup).toContain("Buscar en la tabla");
    expect(markup).toContain("2 de 2 registros");
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
});
