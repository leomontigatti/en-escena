import { createDataTableShouldRevalidate } from "@/components/shared/data-table-revalidation";
import { loadPortalDancersList } from "@/features/portal/dancers/list/server";
import {
  PortalDancersListRouteView,
  portalDancerFacetedFilterIds,
} from "@/features/portal/dancers/list/view";
import type { PortalRouteHandle } from "@/components/portal/ui";

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

export const shouldRevalidate = createDataTableShouldRevalidate({
  filterParamNames: [...portalDancerFacetedFilterIds],
});

export default function PortalBailarinesRoute({
  loaderData,
}: PortalDancersListRouteProps) {
  return <PortalDancersListRouteView loaderData={loaderData} />;
}
