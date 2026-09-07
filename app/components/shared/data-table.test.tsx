/** @vitest-environment jsdom */

import { act, useEffect, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createMemoryRouter,
  MemoryRouter,
  RouterProvider,
  useLocation,
} from "react-router";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  buildDataTableFilterHref,
  buildDataTablePageHref,
  buildDataTableSearchHref,
  buildDataTableSortHref,
  ClientDataTable,
  ServerDataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { dataTableSearchDebounceMs } from "@/components/shared/data-table.shared";
import {
  clickReactDomButton,
  createReactDomTestRenderer,
  setInputValue,
} from "@/lib/test-support/react-dom";

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
  const renderer = createReactDomTestRenderer();

  afterEach(renderer.cleanup);

  test("renders client-side faceted filters without initial values", async () => {
    await renderer.renderAsync(
      <MemoryRouter initialEntries={["/administracion/eventos"]}>
        <ClientDataTable
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
              id: "estado",
              label: "Estado",
              options: [
                { label: "Activo", value: "active" },
                { label: "Archivado", value: "archived" },
              ],
            },
          ]}
        />
      </MemoryRouter>,
    );

    const container = renderer.getContainer();
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
          "/administracion/profesores?busqueda=Ana&estado=archivados&pagina=2",
        ]}
      >
        <ServerDataTable
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
              id: "estado",
              label: "Estado",
              options: [
                { label: "Activos", value: "activos" },
                { label: "Archivados", value: "archivados" },
                { label: "Todos", value: "todos" },
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
      'href="/administracion/profesores?busqueda=Ana&amp;estado=archivados&amp;orden=name%3Adesc"',
    );
    expect(markup).toContain(">1<");
    expect(markup).toContain("Actualizando");
    expect(markup).toContain(
      'href="/administracion/profesores?busqueda=Ana&amp;estado=archivados"',
    );
    expect(markup).toContain(
      'href="/administracion/profesores?busqueda=Ana&amp;estado=archivados&amp;pagina=2"',
    );
    expect(markup).toContain(
      'href="/administracion/profesores?busqueda=Ana&amp;estado=archivados&amp;pagina=3"',
    );
  });

  test("preserves client-side filtering behavior when server-side mode is not enabled", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/portal/profesores"]}>
        <ClientDataTable
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
        <ClientDataTable
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
              id: "archivo",
              label: "Archivo",
              options: [{ label: "Archivado", value: "archived" }],
            },
          ]}
          baseFacetedFilterValues={{
            filters: {
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

  test("selects and deselects visible client-side rows from the header checkbox", async () => {
    await renderer.renderAsync(
      <MemoryRouter initialEntries={["/administracion/finanzas/academy_1"]}>
        <ClientDataTable
          rows={[
            {
              id: "choreography_1",
              academy: "Academia Norte",
              name: "Aire",
              status: "active",
            },
            {
              id: "choreography_2",
              academy: "Academia Norte",
              name: "Tango",
              status: "active",
            },
          ]}
          columns={columns}
          getRowKey={(row) => row.id}
          searchPlaceholder="Buscar coreografía por nombre"
          selectableRows
          textFilterColumnId="name"
        />
      </MemoryRouter>,
    );

    const checkboxes = getRenderedCheckboxes();
    expect(checkboxes).toHaveLength(3);
    expect(checkboxes.map((checkbox) => checkbox.ariaChecked)).toEqual([
      "false",
      "false",
      "false",
    ]);

    await clickCheckbox(checkboxes[0]);

    expect(checkboxes.map((checkbox) => checkbox.ariaChecked)).toEqual([
      "true",
      "true",
      "true",
    ]);

    await clickCheckbox(checkboxes[0]);

    expect(checkboxes.map((checkbox) => checkbox.ariaChecked)).toEqual([
      "false",
      "false",
      "false",
    ]);
  });
});

describe("DataTable fit layout", () => {
  const weightedColumns: DataTableColumn<Row>[] = [
    { id: "name", header: "Nombre", width: 1, cell: (row) => row.name },
    { id: "academy", header: "Academia", width: 3, cell: (row) => row.academy },
  ];

  const row: Row = {
    id: "choreography_1",
    academy: "Academia Norte",
    name: "Coreografía 01",
    status: "active",
  };

  function renderTable({
    layout,
    selectableRows,
  }: {
    layout?: "auto" | "fit";
    selectableRows?: boolean;
  }) {
    return renderToStaticMarkup(
      <MemoryRouter initialEntries={["/administracion/coreografias"]}>
        <ServerDataTable
          rows={[row]}
          columns={weightedColumns}
          getRowKey={(current) => current.id}
          layout={layout}
          selectableRows={selectableRows}
          searchPlaceholder="Buscar coreografía por nombre"
          currentPage={1}
          totalPages={1}
          totalRows={1}
        />
      </MemoryRouter>,
    );
  }

  function getColumnWidths(markup: string) {
    return Array.from(markup.matchAll(/<col style="width:([^"]*)"/g)).map(
      ([, width]) => width,
    );
  }

  test("leaves the columns to the browser unless the table is asked to fit", () => {
    const markup = renderTable({ layout: "auto" });

    expect(markup).not.toContain("<colgroup>");
    expect(markup).not.toContain("table-fixed");
  });

  test("shares the row out by weight, whatever the weights add up to", () => {
    const markup = renderTable({ layout: "fit" });

    expect(markup).toContain("table-fixed");
    // Four parts, not a hundred: a weight is a share of the row and not a
    // percentage the view had to balance itself.
    expect(getColumnWidths(markup)).toEqual([
      "calc(100% * 1 / 4)",
      "calc(100% * 3 / 4)",
    ]);
  });

  test("takes the selection column out of the row before sharing the rest", () => {
    const markup = renderTable({ layout: "fit", selectableRows: true });

    // The view never declared the checkbox, so the table is what has to account
    // for it. Were it not taken out first, these columns would still claim the
    // whole row and overflow it by exactly the checkbox's width.
    expect(getColumnWidths(markup)).toEqual([
      "2.5rem",
      "calc((100% - 2.5rem) * 1 / 4)",
      "calc((100% - 2.5rem) * 3 / 4)",
    ]);
  });

  test("leaves a column with no weight to share what the others did not claim", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/administracion/coreografias"]}>
        <ServerDataTable
          rows={[row]}
          columns={[
            { id: "name", header: "Nombre", width: 1, cell: (c) => c.name },
            { id: "academy", header: "Academia", cell: (c) => c.academy },
          ]}
          getRowKey={(current) => current.id}
          layout="fit"
          searchPlaceholder="Buscar coreografía por nombre"
          currentPage={1}
          totalPages={1}
          totalRows={1}
        />
      </MemoryRouter>,
    );

    expect(markup).toContain('<col style="width:calc(100% * 1 / 1)"/><col/>');
  });
});

describe("ClientDataTable page in the address bar", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(renderer.cleanup);

  test("records the clicked page in the address bar without piling up history", async () => {
    const router = createListRouter("/administracion/finanzas/academy_1");
    await renderer.renderAsync(<RouterProvider router={router} />);

    expect(getRenderedRowNames()).toContain("Coreografía 01");

    await clickElement(getPaginationLink("2"));

    expect(router.state.location.search).toBe("?pagina=2");
    expect(getRenderedRowNames()).toContain("Coreografía 11");
    expect(getRenderedRowNames()).not.toContain("Coreografía 01");
    expect(router.state.preventScrollReset).toBe(true);

    await act(async () => {
      await router.navigate(-1);
    });

    expect(router.state.location.pathname).toBe("/inicio");

    await act(async () => {
      await router.navigate(1);
    });

    expect(router.state.location.pathname).toBe(
      "/administracion/finanzas/academy_1",
    );
    expect(router.state.location.search).toBe("?pagina=2");
    expect(getRenderedRowNames()).toContain("Coreografía 11");
  });

  test("renders the page named in the address bar", async () => {
    const router = createListRouter(
      "/administracion/finanzas/academy_1?pagina=3",
    );
    await renderer.renderAsync(<RouterProvider router={router} />);

    expect(getRenderedRowNames()).toContain("Coreografía 21");
    expect(getRenderedRowNames()).not.toContain("Coreografía 11");
  });

  test("resolves a page beyond the last one to page one", async () => {
    const router = createListRouter(
      "/administracion/finanzas/academy_1?pagina=9",
    );
    await renderer.renderAsync(<RouterProvider router={router} />);

    expect(router.state.location.search).toBe("");
    expect(getRenderedRowNames()).toContain("Coreografía 01");
  });

  test("keeps the row selection while the reader pages", async () => {
    const router = createListRouter("/administracion/finanzas/academy_1", {
      selectableRows: true,
    });
    await renderer.renderAsync(<RouterProvider router={router} />);

    const [, firstRowCheckbox] = getRenderedCheckboxes();
    await clickElement(firstRowCheckbox);

    expect(getRenderedCheckboxes()[1].ariaChecked).toBe("true");

    await clickElement(getPaginationLink("2"));
    await clickElement(getPaginationLink("1"));

    expect(router.state.location.search).toBe("");
    expect(getRenderedCheckboxes()[1].ariaChecked).toBe("true");
  });
});

describe("ClientDataTable search in the address bar", () => {
  const renderer = createReactDomTestRenderer();

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });

  afterEach(() => {
    renderer.cleanup();
    vi.useRealTimers();
  });

  test("filters the rows immediately and records the search once typing stops", async () => {
    const router = createListRouter("/administracion/finanzas/academy_1");
    await renderer.renderAsync(<RouterProvider router={router} />);

    await typeSearch("12");

    expect(getRenderedRowNames()).toEqual(["Coreografía 12"]);
    expect(router.state.location.search).toBe("");

    await advanceSearchDebounce(299);

    expect(router.state.location.search).toBe("");

    await advanceSearchDebounce(1);

    expect(router.state.location.search).toBe("?busqueda=12");
    expect(getSearchInput().value).toBe("12");
  });

  test("replaces the history entry instead of pushing one", async () => {
    const router = createListRouter("/administracion/finanzas/academy_1");
    await renderer.renderAsync(<RouterProvider router={router} />);

    await typeSearch("12");
    await advanceSearchDebounce();

    expect(router.state.location.search).toBe("?busqueda=12");

    await act(async () => {
      await router.navigate(-1);
    });

    expect(router.state.location.pathname).toBe("/inicio");
  });

  test("drops the page when the search changes", async () => {
    const router = createListRouter(
      "/administracion/finanzas/academy_1?pagina=2",
    );
    await renderer.renderAsync(<RouterProvider router={router} />);

    await typeSearch("Coreografía");
    await advanceSearchDebounce();

    const params = new URLSearchParams(router.state.location.search);
    expect(params.get("busqueda")).toBe("Coreografía");
    expect(params.get("pagina")).toBeNull();
  });

  test("renders the search named in the address bar", async () => {
    const router = createListRouter(
      "/administracion/finanzas/academy_1?busqueda=12",
    );
    await renderer.renderAsync(<RouterProvider router={router} />);

    expect(getRenderedRowNames()).toEqual(["Coreografía 12"]);
    expect(getSearchInput().value).toBe("12");
  });

  test("keeps the whitespace the reader typed after the search is recorded", async () => {
    const router = createListRouter("/administracion/finanzas/academy_1");
    await renderer.renderAsync(<RouterProvider router={router} />);

    await typeSearch("Coreografía ");
    await advanceSearchDebounce();

    expect(router.state.location.search).toBe("?busqueda=Coreograf%C3%ADa");
    expect(getSearchInput().value).toBe("Coreografía ");
  });

  test("removes the parameter when the reader clears the search", async () => {
    const router = createListRouter(
      "/administracion/finanzas/academy_1?busqueda=12",
    );
    await renderer.renderAsync(<RouterProvider router={router} />);

    await typeSearch("");
    await advanceSearchDebounce();

    expect(router.state.location.search).toBe("");
    expect(getRenderedRowNames()).toContain("Coreografía 01");
  });
});

describe("ServerDataTable search while the loader is answering", () => {
  const renderer = createReactDomTestRenderer();

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });

  afterEach(() => {
    renderer.cleanup();
    vi.useRealTimers();
  });

  test("keeps what the reader typed while an earlier search is still on its way back", async () => {
    const router = createServerListRouter("/administracion/profesores");
    await renderer.renderAsync(<RouterProvider router={router} />);

    await typeSearch("mar");
    await advanceSearchDebounce();

    expect(router.state.location.search).toBe("?busqueda=mar");

    // The reader types on while the loader is still answering "mar".
    await typeSearch("marían");
    await advanceSearchDebounce();

    expect(router.state.location.search).toBe("?busqueda=mar%C3%ADan");

    // "mar" comes back on its own, after the search that replaced it.
    await advanceTimers(serverLoaderDelayMs - dataTableSearchDebounceMs);

    expect(getSearchInput().value).toBe("marían");

    await advanceTimers(dataTableSearchDebounceMs);

    expect(getSearchInput().value).toBe("marían");
    expect(router.state.location.search).toBe("?busqueda=mar%C3%ADan");
  });

  test("keeps a deletion the loader has not caught up with", async () => {
    const router = createServerListRouter(
      "/administracion/profesores?busqueda=marianela",
    );
    await renderer.renderAsync(<RouterProvider router={router} />);

    expect(getSearchInput().value).toBe("marianela");

    await typeSearch("mari");
    await advanceSearchDebounce();
    await typeSearch("mar");
    await advanceSearchDebounce();

    expect(router.state.location.search).toBe("?busqueda=mar");

    // The longer search comes back after the shorter one replaced it.
    await advanceTimers(serverLoaderDelayMs - dataTableSearchDebounceMs);

    expect(getSearchInput().value).toBe("mar");

    await advanceTimers(dataTableSearchDebounceMs);

    expect(getSearchInput().value).toBe("mar");
  });

  test("adopts a search that comes from outside the box", async () => {
    const router = createServerListRouter("/administracion/profesores");
    await renderer.renderAsync(<RouterProvider router={router} />);

    await typeSearch("mar");
    await advanceSearchDebounce();

    await act(async () => {
      await router.navigate("/administracion/profesores?busqueda=ana");
    });
    await advanceTimers(serverLoaderDelayMs);

    expect(getSearchInput().value).toBe("ana");
  });

  test("records a cleared search without waiting out the debounce", async () => {
    const router = createServerListRouter(
      "/administracion/profesores?busqueda=marianela",
    );
    await renderer.renderAsync(<RouterProvider router={router} />);

    await clickReactDomButton("Limpiar búsqueda");

    expect(getSearchInput().value).toBe("");
    expect(router.state.location.search).toBe("");
  });
});

describe("ClientDataTable filters in the address bar", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(renderer.cleanup);

  test("records the selected filter in the address bar and returns to page one", async () => {
    const router = createListRouter(
      "/administracion/finanzas/academy_1?pagina=2",
      {
        facetedFilters: listFacetedFilters,
      },
    );
    await renderer.renderAsync(<RouterProvider router={router} />);

    await openFiltersPanel();
    await clickFilterOption("Archivado");

    expect(router.state.location.search).toBe("?estado=archived");
    expect(getRenderedRowNames()).toContain("Coreografía 02");
    expect(getRenderedRowNames()).not.toContain("Coreografía 01");
  });

  test("renders the list filtered by the address bar with the control showing the selection", async () => {
    const router = createListRouter(
      "/administracion/finanzas/academy_1?estado=archived",
      { facetedFilters: listFacetedFilters },
    );
    await renderer.renderAsync(<RouterProvider router={router} />);

    expect(getRenderedRowNames()).toContain("Coreografía 02");
    expect(getRenderedRowNames()).not.toContain("Coreografía 01");
    expect(getFiltersTrigger().getAttribute("aria-label")).toBe(
      "Filtros: Estado: Archivado",
    );
  });

  test("removes the parameter when the reader clears the filter", async () => {
    const router = createListRouter(
      "/administracion/finanzas/academy_1?estado=archived",
      { facetedFilters: listFacetedFilters },
    );
    await renderer.renderAsync(<RouterProvider router={router} />);

    await openFiltersPanel();
    await clearFilters();

    expect(router.state.location.search).toBe("");
    expect(getRenderedRowNames()).toContain("Coreografía 01");
  });

  test("replaces the history entry instead of pushing one", async () => {
    const router = createListRouter("/administracion/finanzas/academy_1", {
      facetedFilters: listFacetedFilters,
    });
    await renderer.renderAsync(<RouterProvider router={router} />);

    await openFiltersPanel();
    await clickFilterOption("Archivado");

    expect(router.state.location.search).toBe("?estado=archived");

    await act(async () => {
      await router.navigate(-1);
    });

    expect(router.state.location.pathname).toBe("/inicio");
  });

  test("leaves the filter untouched while the reader pages", async () => {
    const router = createListRouter(
      "/administracion/finanzas/academy_1?busqueda=Coreograf%C3%ADa&estado=archived",
      { facetedFilters: listFacetedFilters },
    );
    await renderer.renderAsync(<RouterProvider router={router} />);

    await clickElement(getPaginationLink("2"));

    const params = new URLSearchParams(router.state.location.search);
    expect(params.get("estado")).toBe("archived");
    expect(params.get("busqueda")).toBe("Coreografía");
    expect(params.get("pagina")).toBe("2");
  });

  test("applies a view's initial filter values while the parameter is absent", async () => {
    const router = createListRouter("/administracion/finanzas/academy_1", {
      facetedFilters: listFacetedFilters,
      initialFacetedFilterValues: { filters: { estado: "archived" } },
    });
    await renderer.renderAsync(<RouterProvider router={router} />);

    expect(getRenderedRowNames()).toContain("Coreografía 02");
    expect(getRenderedRowNames()).not.toContain("Coreografía 01");
    expect(getFiltersTrigger().getAttribute("aria-label")).toBe(
      "Filtros: Estado: Archivado",
    );
  });
});

describe("ClientDataTable sort in the address bar", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(renderer.cleanup);

  test("records the clicked column and direction in the address bar", async () => {
    const router = createListRouter("/administracion/finanzas/academy_1");
    await renderer.renderAsync(<RouterProvider router={router} />);

    await clickElement(getSortHeaderButton("Nombre"));

    expect(router.state.location.search).toBe("?orden=name%3Aasc");
    expect(getRenderedRowNames()[0]).toBe("Coreografía 01");
  });

  test("alternates ascending and descending on repeated clicks", async () => {
    const router = createListRouter("/administracion/finanzas/academy_1");
    await renderer.renderAsync(<RouterProvider router={router} />);

    await clickElement(getSortHeaderButton("Nombre"));
    expect(router.state.location.search).toBe("?orden=name%3Aasc");

    await clickElement(getSortHeaderButton("Nombre"));
    expect(router.state.location.search).toBe("?orden=name%3Adesc");
    expect(getRenderedRowNames()[0]).toBe("Coreografía 25");

    await clickElement(getSortHeaderButton("Nombre"));
    expect(router.state.location.search).toBe("?orden=name%3Aasc");
    expect(getRenderedRowNames()[0]).toBe("Coreografía 01");
  });

  test("renders the rows in the order named in the address bar", async () => {
    const router = createListRouter(
      "/administracion/finanzas/academy_1?orden=name%3Adesc",
    );
    await renderer.renderAsync(<RouterProvider router={router} />);

    expect(getRenderedRowNames()[0]).toBe("Coreografía 25");
  });

  test("applies a view's default order while the parameter is absent", async () => {
    const router = createListRouter("/administracion/finanzas/academy_1", {
      initialSort: { columnId: "name", direction: "desc" },
    });
    await renderer.renderAsync(<RouterProvider router={router} />);

    expect(router.state.location.search).toBe("");
    expect(getRenderedRowNames()[0]).toBe("Coreografía 25");
  });

  test("drops the page when the sort changes", async () => {
    const router = createListRouter(
      "/administracion/finanzas/academy_1?busqueda=Coreograf%C3%ADa&pagina=2",
    );
    await renderer.renderAsync(<RouterProvider router={router} />);

    await clickElement(getSortHeaderButton("Nombre"));

    const params = new URLSearchParams(router.state.location.search);
    expect(params.get("orden")).toBe("name:asc");
    expect(params.get("busqueda")).toBe("Coreografía");
    expect(params.get("pagina")).toBeNull();
  });

  test("replaces the history entry instead of pushing one", async () => {
    const router = createListRouter("/administracion/finanzas/academy_1");
    await renderer.renderAsync(<RouterProvider router={router} />);

    await clickElement(getSortHeaderButton("Nombre"));
    await clickElement(getSortHeaderButton("Nombre"));

    expect(router.state.location.search).toBe("?orden=name%3Adesc");

    await act(async () => {
      await router.navigate(-1);
    });

    expect(router.state.location.pathname).toBe("/inicio");
  });
});

describe("DataTable server-side href helpers", () => {
  test("builds debounced search targets by preserving active filters and clearing page 1", () => {
    expect(
      buildDataTableSearchHref({
        basePath: "/administracion/profesores",
        currentSearch: "?busqueda=Ana&estado=archivados&pagina=2",
        searchValue: "Beto",
      }),
    ).toBe("/administracion/profesores?busqueda=Beto&estado=archivados");

    expect(
      buildDataTableSearchHref({
        basePath: "/administracion/profesores",
        currentSearch: "?busqueda=Ana&estado=archivados&pagina=2",
        searchValue: "",
      }),
    ).toBe("/administracion/profesores?estado=archivados");
  });

  test("builds filter targets by clearing active params and resetting pagination", () => {
    expect(
      buildDataTableFilterHref({
        basePath: "/administracion/profesores",
        currentSearch: "?busqueda=Ana&estado=archivados&pagina=2",
        groups: [
          {
            id: "estado",
            label: "Estado",
            options: [],
          },
        ],
        values: {},
      }),
    ).toBe("/administracion/profesores?busqueda=Ana");
  });

  test("builds pagination targets that preserve active query params", () => {
    expect(
      buildDataTablePageHref({
        basePath: "/administracion/profesores",
        currentSearch: "?busqueda=Ana&estado=archivados&pagina=2",
        page: 1,
      }),
    ).toBe("/administracion/profesores?busqueda=Ana&estado=archivados");

    expect(
      buildDataTablePageHref({
        basePath: "/administracion/profesores",
        currentSearch: "?busqueda=Ana&estado=archivados&pagina=2",
        page: 3,
      }),
    ).toBe(
      "/administracion/profesores?busqueda=Ana&estado=archivados&pagina=3",
    );
  });

  test("keeps honoring per-view parameter name overrides", () => {
    expect(
      buildDataTablePageHref({
        basePath: "/administracion/profesores",
        currentSearch: "?page=2",
        page: 3,
        pageParamName: "page",
      }),
    ).toBe("/administracion/profesores?page=3");

    expect(
      buildDataTableSearchHref({
        basePath: "/administracion/profesores",
        currentSearch: "?pagina=2",
        searchParamName: "q",
        searchValue: "Ana",
      }),
    ).toBe("/administracion/profesores?q=Ana");
  });

  test("builds sort targets by preserving active params and clearing page 1", () => {
    expect(
      buildDataTableSortHref({
        basePath: "/administracion/profesores",
        columnId: "nombre",
        currentSearch: "?busqueda=Ana&estado=archivados&pagina=2",
        direction: "desc",
      }),
    ).toBe(
      "/administracion/profesores?busqueda=Ana&estado=archivados&orden=nombre%3Adesc",
    );
  });
});

const listFacetedFilters = [
  {
    id: "estado",
    label: "Estado",
    options: [
      { label: "Activo", value: "active" },
      { label: "Archivado", value: "archived" },
    ],
  },
];

function createListRouter(
  entry: string,
  {
    facetedFilters,
    initialFacetedFilterValues,
    initialSort,
    selectableRows = false,
  }: {
    facetedFilters?: typeof listFacetedFilters;
    initialFacetedFilterValues?: Record<string, Record<string, string>>;
    initialSort?: { columnId: string; direction: "asc" | "desc" };
    selectableRows?: boolean;
  } = {},
) {
  const [path] = entry.split("?");
  const rows: Row[] = Array.from({ length: 25 }, (_, index) => ({
    id: `choreography_${index + 1}`,
    academy: "Academia Norte",
    name: `Coreografía ${String(index + 1).padStart(2, "0")}`,
    status: index % 2 === 0 ? "active" : "archived",
  }));

  return createMemoryRouter(
    [
      { path: "/inicio", element: <p>Inicio</p> },
      {
        path,
        element: (
          <ClientDataTable
            rows={rows}
            columns={columns}
            getRowKey={(row) => row.id}
            searchPlaceholder="Buscar coreografía por nombre"
            textFilterColumnId="name"
            facetedFilters={facetedFilters}
            initialFacetedFilterValues={initialFacetedFilterValues}
            initialSort={initialSort}
            selectableRows={selectableRows}
          />
        ),
      },
    ],
    { initialEntries: ["/inicio", entry], initialIndex: 1 },
  );
}

/**
 * A server-paginated list whose loader takes `serverLoaderDelayMs` to answer,
 * and answers every search it was asked for — including one a later search
 * overtook. That is the shape the search box has to survive: the reader keeps
 * typing while an earlier search is still in flight.
 */
const serverLoaderDelayMs = 500;

function SlowServerList() {
  const location = useLocation();
  const recordedSearch =
    new URLSearchParams(location.search).get("busqueda") ?? "";
  const [loadedSearch, setLoadedSearch] = useState(recordedSearch);

  useEffect(() => {
    // Deliberately not cancelled: a loader already on its way still answers.
    window.setTimeout(() => {
      setLoadedSearch(recordedSearch);
    }, serverLoaderDelayMs);
  }, [recordedSearch]);

  return (
    <ServerDataTable
      rows={[
        {
          id: "professor_1",
          academy: "Academia Norte",
          name: "Marianela Torres",
          status: "active",
        },
      ]}
      columns={columns}
      getRowKey={(row) => row.id}
      searchPlaceholder="Buscar profesor por nombre"
      initialSearchValue={loadedSearch}
      currentPage={1}
      totalPages={1}
      totalRows={1}
    />
  );
}

function createServerListRouter(entry: string) {
  const [path] = entry.split("?");

  return createMemoryRouter(
    [
      { path: "/inicio", element: <p>Inicio</p> },
      { path, element: <SlowServerList /> },
    ],
    { initialEntries: ["/inicio", entry], initialIndex: 1 },
  );
}

async function advanceTimers(milliseconds: number) {
  await act(async () => {
    vi.advanceTimersByTime(milliseconds);
    await Promise.resolve();
  });
}

function getRenderedRowNames() {
  return Array.from(document.querySelectorAll("tbody tr td:first-of-type")).map(
    (cell) => cell.textContent ?? "",
  );
}

function getPaginationLink(text: string) {
  const link = Array.from(document.querySelectorAll("a")).find(
    (anchor) => anchor.textContent?.trim() === text,
  );

  if (!link) {
    throw new Error(`Expected a pagination link labelled ${text}.`);
  }

  return link;
}

function getSearchInput() {
  const input = document.querySelector('input[type="text"]');

  if (!(input instanceof HTMLInputElement)) {
    throw new Error("Expected the table search input to be rendered.");
  }

  return input;
}

async function typeSearch(value: string) {
  await act(async () => {
    setInputValue(getSearchInput(), value);
    await Promise.resolve();
  });
}

async function advanceSearchDebounce(milliseconds = dataTableSearchDebounceMs) {
  await act(async () => {
    vi.advanceTimersByTime(milliseconds);
    await Promise.resolve();
  });
}

function getRenderedCheckboxes() {
  return Array.from(document.querySelectorAll('[role="checkbox"]')).map(
    (element) => {
      if (!(element instanceof HTMLElement)) {
        throw new Error("Expected checkbox to be an HTMLElement.");
      }

      return element;
    },
  );
}

async function clickCheckbox(checkbox: HTMLElement) {
  await clickElement(checkbox);
}

async function clickElement(element: Element) {
  await act(async () => {
    element.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
      }),
    );
    await Promise.resolve();
  });
}

function getSortHeaderButton(header: string) {
  const button = Array.from(document.querySelectorAll("thead button")).find(
    (candidate) => candidate.textContent?.trim() === header,
  );

  if (!button) {
    throw new Error(`Expected a sortable header labelled ${header}.`);
  }

  return button;
}

function getFiltersTrigger() {
  const trigger = Array.from(document.querySelectorAll("button")).find(
    (button) =>
      button.getAttribute("aria-label")?.startsWith("Filtros") ?? false,
  );

  if (!trigger) {
    throw new Error("Expected the faceted filter trigger to be rendered.");
  }

  return trigger;
}

async function openFiltersPanel() {
  await clickElement(getFiltersTrigger());
}

/** Picks an option of the panel by the label the reader reads next to it. */
async function clickFilterOption(label: string) {
  const optionLabel = Array.from(document.querySelectorAll("label[for]")).find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  const option = optionLabel
    ? document.getElementById(optionLabel.getAttribute("for") ?? "")
    : null;

  if (!option) {
    throw new Error(`Expected the filter option "${label}" to be rendered.`);
  }

  await clickElement(option);
}

/** The panel's footer action, which clears every group at once. */
async function clearFilters() {
  const button = Array.from(
    document.querySelectorAll(
      '[data-slot="data-table-filters-panel-footer"] button',
    ),
  ).find((candidate) => candidate.textContent?.trim() === "Limpiar filtros");

  if (!button) {
    throw new Error("Expected the panel to offer clearing every filter.");
  }

  await clickElement(button);
}
