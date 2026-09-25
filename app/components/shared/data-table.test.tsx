/** @vitest-environment jsdom */

import { act, useEffect, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createMemoryRouter,
  MemoryRouter,
  RouterProvider,
  useLoaderData,
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
import {
  openRadixSelect,
  selectRadixOption,
} from "@/lib/test-support/radix-select";

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

  test("draws the leading columns before the selection checkbox", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/administracion/presentacion"]}>
        <ServerDataTable
          rows={[
            {
              id: "choreography_1",
              academy: "Academia Norte",
              name: "Aire",
              status: "active",
            },
          ]}
          columns={[
            {
              id: "order",
              header: "N.º",
              leading: true,
              cell: () => "1",
            },
            ...columns,
          ]}
          getRowKey={(row) => row.id}
          searchPlaceholder="Buscar coreografía por nombre"
          selectableRows
          currentPage={1}
          totalPages={1}
          totalRows={1}
        />
      </MemoryRouter>,
    );

    expect(markup.indexOf("N.º")).toBeLessThan(
      markup.indexOf("Seleccionar todas las filas"),
    );
    expect(markup.indexOf("Seleccionar todas las filas")).toBeLessThan(
      markup.indexOf("Nombre"),
    );
  });

  test("disables the checkbox of a row the view cannot select", async () => {
    await renderer.renderAsync(
      <MemoryRouter initialEntries={["/administracion/presentacion"]}>
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
              status: "archived",
            },
          ]}
          canSelectRow={(row) => row.status === "active"}
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
    expect(checkboxes[1].hasAttribute("disabled")).toBe(false);
    expect(checkboxes[2].hasAttribute("disabled")).toBe(true);
  });

  test("leaves an unselectable row out of select-all, both in the count and in the toggle", async () => {
    const selections: string[][] = [];

    await renderer.renderAsync(
      <MemoryRouter initialEntries={["/administracion/presentacion"]}>
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
              status: "archived",
            },
          ]}
          canSelectRow={(row) => row.status === "active"}
          columns={columns}
          getRowKey={(row) => row.id}
          searchPlaceholder="Buscar coreografía por nombre"
          selectableRows
          selectedRowIds={[]}
          onSelectedRowIdsChange={(ids) => selections.push(ids)}
          textFilterColumnId="name"
        />
      </MemoryRouter>,
    );

    const checkboxes = getRenderedCheckboxes();

    await clickCheckbox(checkboxes[0]);

    // Only the selectable row is toggled, and the header reads "all selected"
    // off that same row alone rather than waiting for one it can never reach.
    expect(selections.at(-1)).toEqual(["choreography_1"]);
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

  test("gives the selection column a weight so every width stays a percentage", () => {
    const markup = renderTable({ layout: "fit", selectableRows: true });

    // A `col` whose `calc` mixes a percentage with a length is read as `auto`
    // by the browser, which spread every column evenly the moment a selection
    // column was there. The checkbox takes a weight of its own instead, so no
    // width leaves the percentage space.
    expect(getColumnWidths(markup)).toEqual([
      "calc(100% * 3 / 7)",
      "calc(100% * 1 / 7)",
      "calc(100% * 3 / 7)",
    ]);
  });

  test("cuts a header at its column's edge in a fit table instead of spilling it", () => {
    const markup = renderTable({ layout: "fit" });

    // A fixed column cannot grow to hold its header, so the label is cut like
    // a long cell rather than drawn over the next column's.
    expect(markup).toMatch(
      /<th[^>]*><span title="Academia"[^>]*>Academia<\/span><\/th>/,
    );
  });

  test("cuts a sortable header inside its sort link too", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/administracion/coreografias"]}>
        <ServerDataTable
          rows={[row]}
          columns={[
            {
              id: "academy",
              header: "Academia",
              width: 1,
              cell: (c) => c.academy,
              sortValue: (c) => c.academy,
            },
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

    expect(markup).toMatch(/<a [^>]*max-w-full[^>]*><span title="Academia"/);
  });

  test("leaves a header whole in an auto table, where its column fits it", () => {
    const markup = renderTable({ layout: "auto" });

    expect(markup).not.toContain('title="Academia"');
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

describe("ServerDataTable search behind a real loader", () => {
  const renderer = createReactDomTestRenderer();

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    renderer.cleanup();
    vi.useRealTimers();
  });

  test("clears a search whose loader has not answered yet", async () => {
    const router = createLoaderBackedServerListRouter(
      "/administracion/profesores",
    );
    await renderer.renderAsync(<RouterProvider router={router} />);
    await advanceTimers(serverLoaderDelayMs);

    await typeSearch("mar");
    await advanceSearchDebounce();

    // The loader is still answering "mar" when the reader clears the box.
    await clickReactDomButton("Limpiar búsqueda");
    await advanceTimers(serverLoaderDelayMs * 2);
    await advanceTimers(serverLoaderDelayMs * 2);

    expect(getSearchInput().value).toBe("");
    expect(router.state.location.search).toBe("");
  });
  test("keeps a filter whose loader has not answered yet when a search follows it", async () => {
    const router = createLoaderBackedServerListRouter(
      "/administracion/profesores",
    );
    await renderer.renderAsync(<RouterProvider router={router} />);
    await advanceTimers(serverLoaderDelayMs);

    await act(async () => {
      void router.navigate("/administracion/profesores?estado=archived");
      await Promise.resolve();
    });

    // The loader is still answering the filter when the reader searches.
    await typeSearch("mar");
    await advanceSearchDebounce();
    await advanceTimers(serverLoaderDelayMs * 2);

    expect(router.state.location.search).toBe("?estado=archived&busqueda=mar");
  });
});

describe("ClientDataTable search behind a real loader", () => {
  const renderer = createReactDomTestRenderer();

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    renderer.cleanup();
    vi.useRealTimers();
  });

  test("clears a search whose loader has not answered yet", async () => {
    const router = createLoaderBackedClientListRouter(
      "/administracion/profesores",
    );
    await renderer.renderAsync(<RouterProvider router={router} />);
    await advanceTimers(serverLoaderDelayMs);

    await typeSearch("mar");
    await advanceSearchDebounce();

    // The loader is still answering "mar" when the reader clears the box.
    await clickReactDomButton("Limpiar búsqueda");
    await advanceSearchDebounce();
    await advanceTimers(serverLoaderDelayMs * 2);
    await advanceTimers(serverLoaderDelayMs * 2);

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
    await clickFilterOption("Estado", "Archivado");

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
    await clickFilterOption("Estado", "Archivado");

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

/**
 * The same list behind a loader that takes its time, so the address bar only
 * moves once the loader answers — what the reader's browser actually does.
 */
function LoaderBackedServerList() {
  const { query } = useLoaderData<{ query: string }>();

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
      initialSearchValue={query}
      currentPage={1}
      totalPages={1}
      totalRows={1}
    />
  );
}

function createLoaderBackedServerListRouter(entry: string) {
  const [path] = entry.split("?");

  return createMemoryRouter(
    [
      {
        path,
        element: <LoaderBackedServerList />,
        loader: async ({ request }) => {
          await new Promise((resolve) => {
            window.setTimeout(resolve, serverLoaderDelayMs);
          });

          return {
            query: new URL(request.url).searchParams.get("busqueda") ?? "",
          };
        },
        HydrateFallback: () => null,
      },
    ],
    { initialEntries: [entry] },
  );
}

function createLoaderBackedClientListRouter(entry: string) {
  const [path] = entry.split("?");

  return createMemoryRouter(
    [
      {
        path,
        element: (
          <ClientDataTable
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
          />
        ),
        loader: async () => {
          await new Promise((resolve) => {
            window.setTimeout(resolve, serverLoaderDelayMs);
          });

          return null;
        },
        HydrateFallback: () => null,
      },
    ],
    { initialEntries: [entry] },
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

/** Picks an option out of the panel's picker for the given group. */
async function clickFilterOption(groupLabel: string, optionLabel: string) {
  const field = Array.from(document.querySelectorAll("label[for]")).find(
    (candidate) => candidate.textContent?.trim() === groupLabel,
  );
  const trigger = field
    ? document.getElementById(field.getAttribute("for") ?? "")
    : null;

  if (!trigger) {
    throw new Error(`Expected the "${groupLabel}" filter to be offered.`);
  }

  await openRadixSelect(trigger);
  await selectRadixOption(optionLabel);
}

/** The panel's footer action, which clears every group at once. */
async function clearFilters() {
  const button = Array.from(document.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.trim() === "Limpiar filtros",
  );

  if (!button) {
    throw new Error("Expected the panel to offer clearing every filter.");
  }

  await clickElement(button);
}
