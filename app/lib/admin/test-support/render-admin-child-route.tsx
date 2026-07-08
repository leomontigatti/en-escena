import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";

import { AdministracionRouteView } from "@/routes/administracion";

type AdminParentLoaderData = {
  email: string;
  events: Array<{ active: boolean; id: string; name: string }>;
  selectedEventId: string | null;
};

type RouteStubComponent = NonNullable<
  Parameters<typeof createRoutesStub>[0][number]["Component"]
>;

type RenderAdminChildRouteInput = {
  childComponent: RouteStubComponent;
  childHandle: unknown;
  childId: string;
  childLoaderData: unknown;
  childPath: string;
  initialEntry: string;
  parentLoaderData: AdminParentLoaderData;
};

export function renderAdminChildRoute(input: RenderAdminChildRouteInput) {
  const RoutesStub = createRoutesStub([
    {
      id: "admin",
      path: "/administracion",
      Component: AdministracionRouteView,
      children: [
        {
          id: input.childId,
          path: input.childPath,
          Component: input.childComponent,
          handle: input.childHandle,
        },
      ],
    },
  ]);

  return renderToStaticMarkup(
    createElement(RoutesStub, {
      initialEntries: [input.initialEntry],
      hydrationData: {
        loaderData: {
          admin: input.parentLoaderData,
          [input.childId]: input.childLoaderData,
        },
      },
    }),
  );
}
