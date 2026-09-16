import { createDataTableShouldRevalidate } from "@/components/shared/data-table-revalidation";
import {
  handlePortalDancersListAction,
  loadPortalDancersList,
} from "@/features/portal/dancers/list/server";
import {
  PortalDancersListRouteView,
  portalDancerFacetedFilterIds,
} from "@/features/portal/dancers/list/view";
import type { PortalRouteHandle } from "@/components/portal/ui";
import { recoverableClientAction } from "@/lib/shared/recoverable-client-action";

import type { Route } from "./+types/portal.bailarines";

type PortalDancersListRouteProps = {
  loaderData: Awaited<ReturnType<typeof loader>>;
};

export const meta = () => [
  { title: "Bailarines | Portal de academias | En Escena" },
];

export const handle = {
  portalBreadcrumbs: [{ label: "Bailarines" }],
} satisfies PortalRouteHandle;

export async function loader({ request }: { request: Request }) {
  return await loadPortalDancersList(request);
}

export async function action({ request }: { request: Request }) {
  return await handlePortalDancersListAction(request);
}

export async function clientAction({ serverAction }: Route.ClientActionArgs) {
  return await recoverableClientAction(serverAction);
}

export const shouldRevalidate = createDataTableShouldRevalidate({
  filterParamNames: [...portalDancerFacetedFilterIds],
});

export default function PortalBailarinesRoute({
  loaderData,
}: PortalDancersListRouteProps) {
  return <PortalDancersListRouteView loaderData={loaderData} />;
}
