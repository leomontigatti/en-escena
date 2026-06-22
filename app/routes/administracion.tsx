import { Outlet, useMatches } from "react-router";

import {
  AdminShell,
  getAdminBreadcrumbItems,
  getAdminShellOptions,
} from "@/components/admin/shell";
import {
  loadAdminShellEventContext,
  type AdminShellEventContext,
} from "@/lib/admin/event-context.server";
import { requireAdminPanelUser } from "@/lib/auth/internal-navigation.server";

import type { Route } from "./+types/administracion";

type AdministracionRouteProps = Pick<Route.ComponentProps, "loaderData">;

export const meta: Route.MetaFunction = () => [
  { title: "Panel de administración | En Escena" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireAdminPanelUser(request);
  const eventContext = await loadAdminShellEventContext(request);

  return {
    email: user.email,
    events: eventContext.events,
    selectedEventId: eventContext.selectedEventId,
  } satisfies {
    email: string;
    events: AdminShellEventContext["events"];
    selectedEventId: AdminShellEventContext["selectedEventId"];
  };
}

export function AdministracionRouteView({
  loaderData,
}: AdministracionRouteProps) {
  const matches = useMatches();
  const shellOptions = getAdminShellOptions(matches);

  return (
    <AdminShell
      email={loaderData.email}
      events={loaderData.events}
      selectedEventId={loaderData.selectedEventId}
      breadcrumbItems={getAdminBreadcrumbItems(matches)}
      showEventSelector={shellOptions.showEventSelector}
    >
      <Outlet />
    </AdminShell>
  );
}

export default AdministracionRouteView;
