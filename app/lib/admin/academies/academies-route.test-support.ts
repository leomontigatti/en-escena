import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";

import {
  AcademiesListRouteView,
  loader as academiesLoader,
} from "@/routes/administracion.academias";

export function renderAcademiesRoute(input: {
  loaderData: Awaited<ReturnType<typeof academiesLoader>>;
}) {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      {
        initialEntries: ["/administracion/academias"],
      },
      createElement(AcademiesListRouteView, {
        loaderData: input.loaderData,
      }),
    ),
  );
}

export function academiesRouteArgs(request: Request) {
  return {
    request,
    params: {},
    context: {},
    url: new URL(request.url),
    pattern: "/administracion/academias",
  };
}
