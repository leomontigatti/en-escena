import type { ReactNode } from "react";
import { Outlet, useMatches, useRouteLoaderData } from "react-router";

import { getPortalBreadcrumbItems, PortalShell } from "@/components/portal/ui";
import { ErrorPanel, ErrorScreen } from "@/components/shared/error-panel";
import type { loadPortalShell } from "@/features/portal/shell/server";

type PortalShellRouteViewProps = {
  loaderData: Awaited<ReturnType<typeof loadPortalShell>>;
};

function PortalShellLayout({
  loaderData,
  children,
}: PortalShellRouteViewProps & { children: ReactNode }) {
  const matches = useMatches();

  return (
    <PortalShell
      userEmail={loaderData.email}
      contactName={loaderData.academy.contactName}
      eventContext={loaderData.eventContext}
      breadcrumbItems={getPortalBreadcrumbItems(matches)}
    >
      {children}
    </PortalShell>
  );
}

export function PortalShellRouteView({
  loaderData,
}: PortalShellRouteViewProps) {
  return (
    <PortalShellLayout loaderData={loaderData}>
      <Outlet />
    </PortalShellLayout>
  );
}

/**
 * A screen's error renders where its `<Outlet />` would, so the portal's
 * navigation stays. When the shell's own loader is what failed there is no
 * shell data, and the error takes the whole screen like the root boundary's.
 */
export function PortalShellErrorBoundary({ error }: { error: unknown }) {
  const loaderData =
    useRouteLoaderData<PortalShellRouteViewProps["loaderData"]>(
      "routes/portal",
    );

  if (!loaderData) {
    return <ErrorScreen error={error} />;
  }

  return (
    <PortalShellLayout loaderData={loaderData}>
      <ErrorPanel error={error} homeHref="/portal" />
    </PortalShellLayout>
  );
}
