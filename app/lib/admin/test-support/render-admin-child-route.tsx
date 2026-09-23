import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";

import { AdminShellRouteView } from "@/routes/administracion";

// Every admin route renders the shell around it, and the shell only shows who
// is signed in: one fixed internal account keeps that out of each route's test.
const adminAccount = {
  name: "Ada Admin",
  roleLabel: "Administrador",
  username: "ada.admin",
};

type ParentLoaderData = {
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
  parentLoaderData: ParentLoaderData;
};

export function renderAdminChildRoute(input: RenderAdminChildRouteInput) {
  const RoutesStub = createRoutesStub([
    {
      id: "admin",
      path: "/administracion",
      Component: AdminShellRouteView,
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
          admin: { account: adminAccount, ...input.parentLoaderData },
          [input.childId]: input.childLoaderData,
        },
      },
    }),
  );
}
