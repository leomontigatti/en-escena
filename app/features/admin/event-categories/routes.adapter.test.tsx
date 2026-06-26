import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { describe, expect, test } from "vitest";

import type {
  AdministrativeEventCategoriesLoaderData,
  AdministrativeEventCategoryActionData,
} from "@/features/admin/event-categories/shared";
import { AdministracionCategoriaDetalleRouteView } from "@/routes/administracion.categorias_.$categoryId";
import { AdministracionCategoriaNuevaRouteView } from "@/routes/administracion.categorias_.nueva";
import { AdministracionCategoriasRouteView } from "@/routes/administracion.categorias";

describe("administracion.categorias route adapters", () => {
  test("renders the list feature view from the list route adapter", () => {
    const markup = renderRouteView(
      createElement(AdministracionCategoriasRouteView, {
        loaderData: loaderData({
          categories: [category("categoria_1", "Juvenil")],
          experienceLevels: [experienceLevel("nivel_1", "Inicial")],
        }),
      }),
      "/administracion/categorias",
    );

    expect(markup).toContain("Categorías");
    expect(markup).toContain("Nueva categoría");
    expect(markup).toContain("Juvenil");
    expect(markup).toContain("Inicial");
  });

  test("renders the create feature view from the create route adapter", () => {
    const markup = renderRouteView(
      createElement(AdministracionCategoriaNuevaRouteView, {
        loaderData: loaderData(),
        actionData: actionData("Revisá los campos."),
      }),
      "/administracion/categorias/nueva",
    );

    expect(markup).toContain("Nueva categoría");
    expect(markup).toContain("Definí rango de edad");
    expect(markup).toContain("Volver");
    expect(markup).toContain("Guardar");
  });

  test("renders the detail feature view from the detail route adapter", () => {
    const markup = renderRouteView(
      createElement(AdministracionCategoriaDetalleRouteView, {
        loaderData: loaderData({
          categories: [category("categoria_1", "Juvenil")],
          experienceLevels: [experienceLevel("nivel_1", "Inicial")],
          modalities: [modality("modalidad_1", "Jazz")],
        }),
        actionData: actionData("No pudimos guardar."),
        categoryId: "categoria_1",
      }),
      "/administracion/categorias/categoria_1",
    );

    expect(markup).toContain("Editar categoría");
    expect(markup).toContain("Juvenil");
    expect(markup).toContain("Jazz");
    expect(markup).toContain("Inicial");
    expect(markup).toContain("Guardar");
  });

  test("renders the not-found detail state from the detail route adapter", () => {
    const markup = renderRouteView(
      createElement(AdministracionCategoriaDetalleRouteView, {
        loaderData: loaderData(),
        categoryId: "categoria_inexistente",
      }),
      "/administracion/categorias/categoria_inexistente",
    );

    expect(markup).toContain("Categoría no encontrada");
    expect(markup).toContain("No encontramos esa categoría.");
  });
});

function renderRouteView(element: ReactElement, url: string) {
  const RoutesStub = createRoutesStub([
    {
      path: "*",
      Component: () => element,
    },
  ]);

  return renderToStaticMarkup(
    createElement(RoutesStub, {
      initialEntries: [url],
    }),
  );
}

function category(id: string, name: string) {
  return {
    createdAt: new Date("2026-01-01T00:00:00Z"),
    eventId: "evento_1",
    experienceLevelIds: ["nivel_1"],
    experienceLevelKey: "nivel_1",
    groupTypeKey: "solo",
    groupTypes: ["solo" as const],
    id,
    maxAge: 17,
    minAge: 13,
    modalityIds: ["modalidad_1"],
    name,
  };
}

function experienceLevel(id: string, name: string) {
  return {
    createdAt: new Date("2026-01-01T00:00:00Z"),
    eventId: "evento_1",
    id,
    name,
  };
}

function modality(id: string, name: string) {
  return {
    createdAt: new Date("2026-01-01T00:00:00Z"),
    eventId: "evento_1",
    id,
    name,
  };
}

function loaderData(
  overrides: Partial<AdministrativeEventCategoriesLoaderData> = {},
): AdministrativeEventCategoriesLoaderData {
  return {
    categories: [],
    experienceLevels: [],
    modalities: [],
    prices: [],
    schedules: [],
    selectedEventId: "evento_1",
    submodalities: [],
    ...overrides,
  };
}

function actionData(message: string): AdministrativeEventCategoryActionData {
  return {
    fieldErrors: {},
    message,
    scope: null,
    status: "error",
  };
}
