import { Outlet, useMatches } from "react-router";

import { getPortalBreadcrumbItems, PortalShell } from "@/components/portal/ui";
import type { loadPortalShell } from "@/features/portal/shell/server";

type PortalShellRouteViewProps = {
  loaderData: Awaited<ReturnType<typeof loadPortalShell>>;
};

export function PortalShellRouteView({
  loaderData,
}: PortalShellRouteViewProps) {
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
