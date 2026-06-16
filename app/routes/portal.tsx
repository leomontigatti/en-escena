import { Outlet, useMatches } from "react-router";

import { getPortalBreadcrumbItems, PortalShell } from "@/components/portal/ui";
import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import { getPortalEventContext } from "@/lib/portal/event-context.server";

import type { Route } from "./+types/portal";

type PortalRouteProps = Pick<Route.ComponentProps, "loaderData">;

export const meta: Route.MetaFunction = () => [
  { title: "Portal de academias | En Escena" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const { user, academy } = await requireAcademyUser(request);
  const eventContext = await getPortalEventContext(request);

  return {
    email: user.email,
    academy,
    eventContext,
  };
}

export function PortalRouteView({ loaderData }: PortalRouteProps) {
  const matches = useMatches();

  return (
    <PortalShell
      userEmail={loaderData.email}
      contactName={loaderData.academy.contactName}
      academyName={loaderData.academy.name}
      eventContext={loaderData.eventContext}
      breadcrumbItems={getPortalBreadcrumbItems(matches)}
    >
      <Outlet />
    </PortalShell>
  );
}

export default PortalRouteView;
