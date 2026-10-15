import { createDataTableShouldRevalidate } from "@/components/shared/data-table-revalidation";
import { loadIndividualPayments } from "@/features/individual/payments/server";
import { IndividualPaymentsView } from "@/features/individual/payments/view";
import type { IndividualRouteHandle } from "@/features/individual/shell/view";
import { ownerPaymentFacetedFilterIds } from "@/lib/finances/owner-payment-columns";

import type { Route } from "./+types/particular.pagos";

export const meta: Route.MetaFunction = () => [
  { title: "Pagos | Particular | En Escena" },
];

export const handle = {
  individualBreadcrumb: "Pagos",
} satisfies IndividualRouteHandle;

export async function loader({ request }: Route.LoaderArgs) {
  return await loadIndividualPayments(request);
}

export const shouldRevalidate = createDataTableShouldRevalidate({
  filterParamNames: [...ownerPaymentFacetedFilterIds],
});

export default function IndividualPaymentsRoute({
  loaderData,
}: Route.ComponentProps) {
  return <IndividualPaymentsView loaderData={loaderData} />;
}
