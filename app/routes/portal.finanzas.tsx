import type { PortalRouteHandle } from "@/components/portal/ui";
import { createDataTableShouldRevalidate } from "@/components/shared/data-table-revalidation";
import { loadPortalAcademyFinances } from "@/features/portal/finances/server";
import {
  PortalAcademyFinancesRouteView,
  portalFinanceFacetedFilterIds,
} from "@/features/portal/finances/view";

export const meta = () => [
  { title: "Finanzas | Portal de academias | En Escena" },
];

export const handle = {
  portalBreadcrumbs: [{ label: "Resumen" }],
} satisfies PortalRouteHandle;

export async function loader({ request }: { request: Request }) {
  return await loadPortalAcademyFinances(request);
}

export const shouldRevalidate = createDataTableShouldRevalidate({
  filterParamNames: [...portalFinanceFacetedFilterIds],
});

type PortalFinanzasRouteProps = {
  loaderData: Awaited<ReturnType<typeof loader>>;
};

export default function PortalFinanzasRoute({
  loaderData,
}: PortalFinanzasRouteProps) {
  return <PortalAcademyFinancesRouteView loaderData={loaderData} />;
}
