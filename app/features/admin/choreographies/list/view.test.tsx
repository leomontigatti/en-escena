import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, test } from "vitest";

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
        page: 1,
        query: "Sin resultados",
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
});

function renderRoute(
  loaderData: Partial<
    Parameters<typeof AdministracionCoreografiasRouteView>[0]["loaderData"]
  > = {},
) {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: ["/administracion/coreografias"] },
      createElement(AdministracionCoreografiasRouteView, {
        loaderData: {
          choreographies: [],
          filters: {
            page: 1,
            query: "",
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
