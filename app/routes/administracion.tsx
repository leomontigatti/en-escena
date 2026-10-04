import { Outlet, useMatches } from "react-router";

import {
  AdminShell,
  getAdminBreadcrumbItems,
  getAdminShellOptions,
} from "@/components/admin/shell";
import {
  loadShellEventContext,
  type AdminShellEventContext,
} from "@/lib/admin/event-context.server";
import {
  buildInternalAccount,
  type InternalAccount,
} from "@/lib/auth/internal-account";
import { canWriteInAdminPanel } from "@/lib/auth/admin-panel-access";
import { requireAdminPanelReader } from "@/lib/auth/internal-navigation.server";

import type { Route } from "./+types/administracion";

type AdminShellRouteProps = Pick<Route.ComponentProps, "loaderData">;

export const meta: Route.MetaFunction = () => [
  { title: "Panel de administración | En Escena" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireAdminPanelReader(request);
  const eventContext = await loadShellEventContext();

  return {
    account: buildInternalAccount(user),
    canWrite: canWriteInAdminPanel(user.role),
    events: eventContext.events,
    selectedEventId: eventContext.selectedEventId,
  } satisfies {
    account: InternalAccount;
    canWrite: boolean;
    events: AdminShellEventContext["events"];
    selectedEventId: AdminShellEventContext["selectedEventId"];
  };
}

export function AdminShellRouteView({ loaderData }: AdminShellRouteProps) {
  const matches = useMatches();
  const shellOptions = getAdminShellOptions(matches);

  return (
    <AdminShell
      account={loaderData.account}
      canWrite={loaderData.canWrite}
      events={loaderData.events}
      selectedEventId={loaderData.selectedEventId}
      breadcrumbItems={getAdminBreadcrumbItems(matches)}
      showEventSelector={shellOptions.showEventSelector}
    >
      <Outlet />
    </AdminShell>
  );
}

export default AdminShellRouteView;
