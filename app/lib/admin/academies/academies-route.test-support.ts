import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RouterContextProvider } from "react-router";

import { readRequestedUrl } from "@/lib/shared/requested-url.server";
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
    context: new RouterContextProvider(),
    url: readRequestedUrl(request),
    pattern: "/administracion/academias",
  };
}
