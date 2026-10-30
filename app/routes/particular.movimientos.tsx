import { createDataTableShouldRevalidate } from "@/components/shared/data-table-revalidation";
import { loadIndividualPayments } from "@/features/individual/payments/server";
import { IndividualPaymentsView } from "@/features/individual/payments/view";
import type { IndividualRouteHandle } from "@/features/individual/shell/view";
import { ownerMovementFacetedFilterIds } from "@/lib/finances/owner-movement-columns";

import type { Route } from "./+types/particular.movimientos";

export const meta: Route.MetaFunction = () => [
  { title: "Movimientos | Particular | En Escena" },
];

export const handle = {
  individualBreadcrumb: "Movimientos",
} satisfies IndividualRouteHandle;

export async function loader({ request }: Route.LoaderArgs) {
  return await loadIndividualPayments(request);
}

export const shouldRevalidate = createDataTableShouldRevalidate({
  filterParamNames: [...ownerMovementFacetedFilterIds],
});

export default function IndividualPaymentsRoute({
  loaderData,
}: Route.ComponentProps) {
  return <IndividualPaymentsView loaderData={loaderData} />;
}
