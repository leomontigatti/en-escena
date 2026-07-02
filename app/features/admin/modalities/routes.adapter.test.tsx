import { createElement, type ReactElement } from "react";
import type { ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { describe, expect, test } from "vitest";

import type {
  AdministrativeEventModalitiesLoaderData,
  AdministrativeEventModalityActionData,
} from "@/features/admin/modalities/shared";
import { AdministracionModalidadDetalleRouteView } from "@/routes/administracion.modalidades_.$modalityId";
import { AdministracionModalidadNuevaRouteView } from "@/routes/administracion.modalidades_.nueva";
import { AdministracionModalidadesRouteView } from "@/routes/administracion.modalidades";

describe("administracion.modalidades route adapters", () => {
  test("renders the list feature view from the list route adapter", () => {
    const markup = renderRouteView(
      createElement(AdministracionModalidadesRouteView, {
        loaderData: loaderData({
          modalities: [modality("mod_1", "Jazz")],
          submodalities: [submodality("sub_1", "mod_1", "Jazz Funk")],
        }),
      }),
      "/administracion/modalidades",
    );

    expect(markup).toContain("Modalidades");
    expect(markup).toContain("Nueva modalidad");
    expect(markup).toContain("Jazz");
    expect(markup).toContain("Jazz Funk");
  });

  test("renders the create feature view from the create route adapter", () => {
    const markup = renderRouteView(
      createElement(
        AdministracionModalidadNuevaRouteView as ComponentType<{
          loaderData: AdministrativeEventModalitiesLoaderData;
          actionData?: AdministrativeEventModalityActionData;
        }>,
        {
          loaderData: loaderData(),
          actionData: actionData("Revisá los datos."),
        },
      ),
      "/administracion/modalidades/nueva",
    );

    expect(markup).toContain("Nueva modalidad");
    expect(markup).toContain("Definí una modalidad");
    expect(markup).toContain("Volver");
    expect(markup).toContain("Guardar");
  });

  test("renders the detail feature view from the detail route adapter", () => {
    const markup = renderRouteView(
      createElement(AdministracionModalidadDetalleRouteView, {
        actionData: actionData("No pudimos guardar."),
        loaderData: loaderData({
          modalities: [modality("mod_1", "Jazz")],
          submodalities: [submodality("sub_1", "mod_1", "Jazz Funk")],
        }),
        modalityId: "mod_1",
      }),
      "/administracion/modalidades/mod_1",
    );

    expect(markup).toContain("Editar modalidad");
    expect(markup).toContain("Jazz");
    expect(markup).toContain("Jazz Funk");
    expect(markup).toContain("Agregar submodalidad");
    expect(markup).toContain("Guardar");
  });

  test("renders the not-found detail state from the detail route adapter", () => {
    const markup = renderRouteView(
      createElement(AdministracionModalidadDetalleRouteView, {
        loaderData: loaderData(),
        modalityId: "mod_inexistente",
      }),
      "/administracion/modalidades/mod_inexistente",
    );

    expect(markup).toContain("Modalidad no encontrada");
    expect(markup).toContain("No encontramos esa modalidad.");
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

function modality(id: string, name: string) {
  return {
    createdAt: new Date("2026-01-01T00:00:00Z"),
    eventId: "evento_1",
    id,
    name,
  };
}

function submodality(id: string, modalityId: string, name: string) {
  return {
    createdAt: new Date("2026-01-01T00:00:00Z"),
    eventId: "evento_1",
    id,
    modalityId,
    name,
  };
}

function loaderData(
  overrides: Partial<AdministrativeEventModalitiesLoaderData> = {},
): AdministrativeEventModalitiesLoaderData {
  return {
    modalities: [],
    selectedEventId: "evento_1",
    submodalities: [],
    ...overrides,
  };
}

function actionData(message: string): AdministrativeEventModalityActionData {
  return {
    fieldErrors: {},
    message,
    scope: null,
    status: "error",
  };
}
