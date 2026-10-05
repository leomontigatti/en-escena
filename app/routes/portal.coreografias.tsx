import { createDataTableShouldRevalidate } from "@/components/shared/data-table-revalidation";
import { loadPortalChoreographiesList } from "@/features/portal/choreographies/list/server";
import {
  PortalChoreographiesListRouteView,
  portalChoreographyFacetedFilterIds,
} from "@/features/portal/choreographies/list/view";
import type { PortalRouteHandle } from "@/components/portal/ui";

type PortalChoreographiesListRouteProps = {
  loaderData: Awaited<ReturnType<typeof loader>>;
};

export const meta = () => [
  { title: "Coreografías | Portal de academias | En Escena" },
];

export const handle = {
  portalBreadcrumbs: [{ label: "Coreografías" }],
} satisfies PortalRouteHandle;

export async function loader({ request }: { request: Request }) {
  return await loadPortalChoreographiesList(request);
}

export const shouldRevalidate = createDataTableShouldRevalidate({
  filterParamNames: [...portalChoreographyFacetedFilterIds],
});

export default function PortalCoreografiasRoute({
  loaderData,
}: PortalChoreographiesListRouteProps) {
  return <PortalChoreographiesListRouteView loaderData={loaderData} />;
}
