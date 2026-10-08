import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  AcademiesListRouteView,
  loader as academiesLoader,
} from "@/routes/administracion.academias";
import { renderInDataRouter } from "@/lib/test-support/data-router";

export function renderAcademiesRoute(input: {
  loaderData: Awaited<ReturnType<typeof academiesLoader>>;
}) {
  return renderToStaticMarkup(
    renderInDataRouter(
      "/administracion/academias",
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
