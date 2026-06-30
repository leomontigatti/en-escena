import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, test } from "vitest";

import { buildDataTableFilterHref } from "@/components/shared/data-table";
import { AdministracionCoreografiasRouteView } from "@/features/admin/choreographies/list/view";

describe("AdministracionCoreografiasRouteView", () => {
  test("shows the event-required empty state when there is no active event", () => {
    const markup = renderRoute({
      selectedEventId: null,
    });

    expect(markup).toContain(
      "Elegí un evento activo para revisar coreografías",
    );
    expect(markup).toContain(
      "Activá un evento para consultar las coreografías registradas por las academias.",
    );
    expect(markup).not.toContain("Todavía no hay coreografías para mostrar.");
  });

  test("shows the no-data empty state for the active event", () => {
    const markup = renderRoute();

    expect(markup).toContain("Todavía no hay coreografías para mostrar.");
    expect(markup).toContain(
      "Cuando las academias registren coreografías para el evento activo, vas a poder revisarlas desde este listado.",
    );
  });

  test("renders plain-text names with the approved columns and shared status badges", () => {
    const markup = renderRoute({
      choreographies: [
        {
          academyName: "Academia Norte",
          categoryName: "Juvenil",
          groupType: "duo",
          id: "choreo_1",
          modalityName: "Jazz",
          name: "Pieza Visible",
          operationalStatus: {
            code: "complete",
            pendingItems: [],
          },
          submodalityName: "Lyrical",
        },
        {
          academyName: "Academia Sur",
          categoryName: null,
          groupType: "solo",
          id: "choreo_2",
          modalityName: "Contemporáneo",
          name: "Borrador",
          operationalStatus: {
            code: "incomplete",
            pendingItems: ["music"],
          },
          submodalityName: null,
        },
      ],
    });

    for (const column of [
      "Nombre",
      "Academia",
      "Modalidad / Submodalidad",
      "Categoría / Tipo de grupo",
      "Estado",
    ]) {
      expect(markup).toContain(column);
    }

    expect(markup).toContain("Pieza Visible");
    expect(markup).toContain("Borrador");
    expect(markup).not.toContain('href="/administracion/coreografias/');
    expect(markup).toContain("Jazz · Lyrical");
    expect(markup).toContain("Contemporáneo");
    expect(markup).toContain("Juvenil · Dúo");
    expect(markup).toContain("Sin asignar · Solo");
    expect(markup).toContain("Completa");
    expect(markup).toContain("Incompleta");
    expect(markup).toContain('data-variant="success"');
    expect(markup).toContain('data-variant="warning"');
  });

  test("keeps filtered empty results inside the table when the active event has coreographies", () => {
    const markup = renderRoute({
      filters: {
        category: null,
        groupType: null,
        modalityId: null,
        order: {
          columnId: "academia",
          direction: "asc",
        },
        page: 1,
        query: "Sin resultados",
        status: null,
      },
      hasAnyChoreography: true,
    });

    expect(markup).toContain("Buscar coreografía por nombre o academia");
    expect(markup).toContain('value="Sin resultados"');
    expect(markup).toContain(
      "No hay coreografías que coincidan con la búsqueda o los filtros.",
    );
    expect(markup).not.toContain("Todavía no hay coreografías para mostrar.");
  });

  test("renders operational faceted filters with the approved URL values", () => {
    const markup = renderRoute({
      facets: {
        categories: [
          { label: "Adulto", value: "categoria_1" },
          { label: "Sin asignar", value: "sin-asignar" },
        ],
        modalities: [{ label: "Contemporáneo", value: "modalidad_1" }],
      },
      filters: {
        category: "categoria_1",
        groupType: "duo",
        modalityId: "modalidad_1",
        order: {
          columnId: "academia",
          direction: "asc",
        },
        page: 1,
        query: "",
        status: "incompleta",
      },
      hasAnyChoreography: true,
    });

    expect(markup).toContain(
      'aria-label="Filtros: Estado: Incompleta, Modalidad: Contemporáneo, Categoría: Adulto, Tipo de grupo: Dúo"',
    );
  });

  test("preserves busqueda and orden while resetting pagina on filter links", () => {
    const href = buildDataTableFilterHref({
      basePath: "/administracion/coreografias",
      currentSearch: "?busqueda=Luna&orden=nombre:desc&pagina=2",
      groups: [
        {
          id: "estado",
          label: "Estado",
          options: [
            { label: "Completa", value: "completa" },
            { label: "Incompleta", value: "incompleta" },
          ],
        },
      ],
      pageParamName: "pagina",
      values: { estado: "completa" },
    });

    expect(href).toBe(
      "/administracion/coreografias?busqueda=Luna&orden=nombre%3Adesc&estado=completa",
    );
  });
});

function renderRoute(
  loaderData: Partial<
    Parameters<typeof AdministracionCoreografiasRouteView>[0]["loaderData"]
  > = {},
  initialEntry = "/administracion/coreografias",
) {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: [initialEntry] },
      createElement(AdministracionCoreografiasRouteView, {
        loaderData: {
          choreographies: [],
          facets: {
            categories: [],
            modalities: [],
          },
          filters: {
            category: null,
            groupType: null,
            modalityId: null,
            order: {
              columnId: "academia",
              direction: "asc",
            },
            page: 1,
            query: "",
            status: null,
          },
          hasAnyChoreography: false,
          selectedEventId: "event_1",
          totalCount: 0,
          totalPages: 1,
          ...loaderData,
        },
      }),
    ),
  );
}
