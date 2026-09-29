import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, test } from "vitest";

import { buildDataTableFilterHref } from "@/components/shared/data-table";
import { ChoreographiesListRouteView } from "@/features/admin/choreographies/list/view";

describe("ChoreographiesListRouteView", () => {
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
    expect(markup).not.toContain(
      "Esta academia no tiene coreografías en este evento",
    );
  });

  test("titles the page with the academy and says when it has nothing in the event", () => {
    const markup = renderRoute();

    expect(markup).toMatch(/<h2[^>]*>Academia Norte<\/h2>/);
    expect(markup).toContain(
      "Esta academia no tiene coreografías en este evento",
    );
    expect(markup).toContain(
      "Cuando la academia registre coreografías para el evento activo, vas a poder revisarlas desde este listado.",
    );
  });

  test("renders the number as the only detail link, under the academy, with the approved columns and shared status badges", () => {
    const markup = renderRoute({
      choreographies: [
        {
          categoryName: "Juvenil",
          choreographyNumber: 1,
          groupType: "duo",
          id: "choreo_1",
          isWithdrawn: false,
          modalityName: "Jazz",
          name: "Pieza Visible",
          operationalStatus: {
            code: "complete",
            pendingItems: [],
          },
          submodalityName: "Lyrical",
        },
        {
          categoryName: "Juvenil",
          choreographyNumber: 2,
          groupType: "solo",
          id: "choreo_2",
          isWithdrawn: false,
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
      "#",
      "Nombre",
      "Modalidad / Submodalidad",
      "Categoría / Tipo de grupo",
      "Estado",
    ]) {
      expect(markup).toContain(column);
    }

    // The number is shown zero-padded and is the row's only link to the
    // detail; the name renders as plain text beside it.
    expect(markup).toContain("00001");
    expect(markup).toContain("00002");
    expect(markup).toContain("Pieza Visible");
    expect(markup).toContain("Borrador");
    expect(markup).toContain(
      'href="/administracion/coreografias/academy_1/choreo_1"',
    );
    expect(markup).toContain(
      'href="/administracion/coreografias/academy_1/choreo_2"',
    );
    // The academy is the page itself, so no column repeats it.
    expect(markup).not.toContain(">Academia<");
    expect(markup).toContain(">00001</a>");
    expect(markup).not.toContain(">Pieza Visible</a>");
    expect(markup).not.toContain(">Borrador</a>");
    expect(markup).toContain("Jazz · Lyrical");
    expect(markup).toContain("Contemporáneo");
    expect(markup).toContain("Juvenil · Dúo");
    expect(markup).toContain("Juvenil · Solo");
    expect(markup).toContain("Completa");
    expect(markup).toContain("Incompleta");
    expect(markup).toContain('data-variant="success"');
    expect(markup).toContain('data-variant="warning"');
  });

  test("badges a withdrawn row `Retirada` in place of its operational status", () => {
    const markup = renderRoute({
      choreographies: [
        {
          categoryName: "Juvenil",
          choreographyNumber: 3,
          groupType: "solo",
          id: "choreo_3",
          isWithdrawn: true,
          modalityName: "Jazz",
          name: "Pieza Retirada",
          // Complete on the readiness axis, so the badge that shows proves the
          // withdrawal replaced it rather than merely joined it.
          operationalStatus: {
            code: "complete",
            pendingItems: [],
          },
          submodalityName: null,
        },
      ],
      filters: {
        category: null,
        groupType: null,
        modalityId: null,
        order: { columnId: "nombre", direction: "asc" },
        page: 1,
        query: "",
        scheduleDate: null,
        status: "retirada",
      },
      hasAnyChoreography: true,
    });

    expect(markup).toContain("Retirada");
    expect(markup).not.toContain("Completa");
    expect(markup).toContain('aria-label="Estado: Retirada"');
  });

  test("keeps filtered empty results inside the table when the active event has coreographies", () => {
    const markup = renderRoute({
      filters: {
        category: null,
        groupType: null,
        modalityId: null,
        order: { columnId: "nombre", direction: "asc" },
        page: 1,
        query: "Sin resultados",
        scheduleDate: null,
        status: null,
      },
      hasAnyChoreography: true,
    });

    expect(markup).toContain("Buscar por número o nombre");
    expect(markup).toContain('value="Sin resultados"');
    expect(markup).toContain(
      "No hay coreografías que coincidan con la búsqueda o los filtros.",
    );
    expect(markup).not.toContain(
      "Esta academia no tiene coreografías en este evento",
    );
  });

  test("renders operational faceted filters with the approved URL values", () => {
    const markup = renderRoute({
      facets: {
        categories: [
          { label: "Adulto", value: "categoria_1" },
          { label: "Juvenil", value: "categoria_2" },
        ],
        modalities: [{ label: "Contemporáneo", value: "modalidad_1" }],
        scheduleDates: [{ label: "3 de octubre de 2026", value: "2026-10-03" }],
      },
      filters: {
        category: "categoria_1",
        groupType: "duo",
        modalityId: "modalidad_1",
        order: { columnId: "nombre", direction: "asc" },
        page: 1,
        query: "",
        scheduleDate: "2026-10-03",
        status: "incompleta",
      },
      hasAnyChoreography: true,
    });

    for (const filter of [
      "Estado: Incompleta",
      "Modalidad: Contemporáneo",
      "Categoría: Adulto",
      "Tipo de grupo: Dúo",
      "Día: 3 de octubre de 2026",
    ]) {
      expect(markup).toContain(`aria-label="${filter}"`);
    }
  });

  test("reads an applied `Estado` filter as the badge its rows wear", () => {
    const markup = renderRoute({
      filters: {
        category: null,
        groupType: null,
        modalityId: null,
        order: { columnId: "nombre", direction: "asc" },
        page: 1,
        query: "",
        scheduleDate: null,
        status: "incompleta",
      },
      hasAnyChoreography: true,
    });
    // The filter's markup up to its remove button, which ends the group.
    const filter = markup.match(
      /data-filter-group="estado"[\s\S]*?Quitar filtro Estado/,
    )?.[0];

    expect(filter).toMatch(
      /data-slot="badge"[^>]*data-variant="warning"[^>]*>Incompleta</,
    );
  });

  test("preserves busqueda and orden while resetting pagina on filter links", () => {
    const href = buildDataTableFilterHref({
      basePath: "/administracion/coreografias/academy_1",
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
      values: { estado: "completa" },
    });

    expect(href).toBe(
      "/administracion/coreografias/academy_1?busqueda=Luna&orden=nombre%3Adesc&estado=completa",
    );
  });
});

function renderRoute(
  loaderData: Partial<
    Parameters<typeof ChoreographiesListRouteView>[0]["loaderData"]
  > = {},
  initialEntry = "/administracion/coreografias/academy_1",
) {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: [initialEntry] },
      createElement(ChoreographiesListRouteView, {
        loaderData: {
          academy: { id: "academy_1", name: "Academia Norte" },
          choreographies: [],
          facets: {
            categories: [],
            modalities: [],
            scheduleDates: [],
          },
          filters: {
            category: null,
            groupType: null,
            modalityId: null,
            order: {
              columnId: "numero",
              direction: "asc",
            },
            page: 1,
            query: "",
            scheduleDate: null,
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
