import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";

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

export { renderRouteView };
