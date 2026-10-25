import type { PortalRouteHandle } from "@/components/portal/ui";
import { createDataTableShouldRevalidate } from "@/components/shared/data-table-revalidation";
import { loadPortalAcademyPayments } from "@/features/portal/payments/list/server";
import {
  PortalAcademyPaymentsRouteView,
  portalPaymentFacetedFilterIds,
} from "@/features/portal/payments/list/view";

export const meta = () => [
  { title: "Movimientos | Portal de academias | En Escena" },
];

export const handle = {
  portalBreadcrumbs: [{ label: "Movimientos" }],
} satisfies PortalRouteHandle;

export async function loader({ request }: { request: Request }) {
  return await loadPortalAcademyPayments(request);
}

export const shouldRevalidate = createDataTableShouldRevalidate({
  filterParamNames: [...portalPaymentFacetedFilterIds],
});

type PortalMovementsRouteProps = {
  loaderData: Awaited<ReturnType<typeof loader>>;
};

export default function PortalMovementsRoute({
  loaderData,
}: PortalMovementsRouteProps) {
  return <PortalAcademyPaymentsRouteView loaderData={loaderData} />;
}
