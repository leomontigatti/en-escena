import type { ReactNode } from "react";
import { Outlet, useMatches, useRouteLoaderData } from "react-router";

import {
  AdminShell,
  getAdminBreadcrumbItems,
  getAdminShellOptions,
} from "@/components/admin/shell";
import { ErrorPanel, ErrorScreen } from "@/components/shared/error-panel";
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

function AdminShellLayout({
  loaderData,
  children,
}: AdminShellRouteProps & { children: ReactNode }) {
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
      {children}
    </AdminShell>
  );
}

export function AdminShellRouteView({ loaderData }: AdminShellRouteProps) {
  return (
    <AdminShellLayout loaderData={loaderData}>
      <Outlet />
    </AdminShellLayout>
  );
}

/**
 * A screen's error renders where its `<Outlet />` would, so the sidebar and
 * header stay. When this route's own loader is what failed there is no shell
 * data, and the error takes the whole screen like the root boundary's.
 */
export function ErrorBoundary({
  error,
}: Pick<Route.ErrorBoundaryProps, "error">) {
  const loaderData = useRouteLoaderData<typeof loader>("routes/administracion");

  if (!loaderData) {
    return <ErrorScreen error={error} />;
  }

  return (
    <AdminShellLayout loaderData={loaderData}>
      <ErrorPanel error={error} homeHref="/administracion" />
    </AdminShellLayout>
  );
}

export default AdminShellRouteView;
