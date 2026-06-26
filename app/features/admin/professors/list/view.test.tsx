import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, test } from "vitest";

import { AdministracionProfesoresRouteView } from "@/features/admin/professors/list/view";

describe("AdministracionProfesoresRouteView", () => {
  test("shows the empty state when there are no profesores and no active filters", () => {
    const markup = renderRoute();

    expect(markup).toContain("Profesores");
    expect(markup).toContain("Todavía no hay Profesores para mostrar.");
    expect(markup).toContain(
      "Cuando haya profesores activos vas a poder revisarlos desde este listado.",
    );
  });

  test("renders the table with event-aware filters and detail links", () => {
    const markup = renderRoute({
      filters: {
        nameOrder: "desc",
        page: 2,
        participation: "no",
        query: "Academia Sur",
        status: "archived",
      },
      hasAnyProfessor: true,
      professors: [
        {
          academyName: "Academia Sur",
          active: false,
          firstName: "Bruno",
          id: "profesor_2",
          identificationStatus: "incomplete",
          lastName: "Consulta",
          participationStatus: "not-participating",
        },
      ],
      selectedEventId: "evento_1",
      totalCount: 1,
    });

    expect(markup).toContain(
      "Buscar profesor por nombre, número de documento o academia",
    );
    expect(markup).toContain('value="Academia Sur"');
    expect(markup).toContain(
      'aria-label="Filtros: Participación: No participando, Archivo: Archivado"',
    );
    expect(markup).toContain("Bruno Consulta");
    expect(markup).toContain("Academia Sur");
    expect(markup).toContain("No participando");
    expect(markup).toContain("Archivado");
    expect(markup).toContain(
      'href="/administracion/profesores/profesor_2?busqueda=Academia+Sur&amp;orden=nombre%3Adesc&amp;participando=no&amp;estado=archivados&amp;pagina=2"',
    );
  });

  test("keeps filtered empty results inside the table", () => {
    const markup = renderRoute({
      filters: {
        nameOrder: "asc",
        page: 1,
        participation: "all",
        query: "No existe",
        status: "active",
      },
      hasAnyProfessor: true,
    });

    expect(markup).toContain('value="No existe"');
    expect(markup).toContain(
      "No hay Profesores que coincidan con la búsqueda o los filtros.",
    );
    expect(markup).not.toContain("Todavía no hay Profesores para mostrar.");
  });
});

function renderRoute(
  loaderData: Partial<
    Parameters<typeof AdministracionProfesoresRouteView>[0]["loaderData"]
  > = {},
) {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: ["/administracion/profesores"] },
      createElement(AdministracionProfesoresRouteView, {
        loaderData: {
          filters: {
            nameOrder: "asc",
            page: 1,
            participation: "all",
            query: "",
            status: "active",
          },
          hasAnyProfessor: false,
          professors: [],
          selectedEventId: null,
          totalCount: 0,
          totalPages: 1,
          ...loaderData,
        },
      }),
    ),
  );
}
