import { createDataTableShouldRevalidate } from "@/components/shared/data-table-revalidation";
import { loadIndividualFinances } from "@/features/individual/finances/server";
import { IndividualFinancesView } from "@/features/individual/finances/view";
import type { IndividualRouteHandle } from "@/features/individual/shell/view";
import { ownerPaymentFacetedFilterIds } from "@/lib/finances/owner-payment-columns";
import { listTabParam } from "@/lib/shared/url-tab";

import type { Route } from "./+types/particular.finanzas";

export const meta: Route.MetaFunction = () => [
  { title: "Finanzas | Particular | En Escena" },
];

export const handle = {
  individualBreadcrumb: "Finanzas",
} satisfies IndividualRouteHandle;

export async function loader({ request }: Route.LoaderArgs) {
  return await loadIndividualFinances(request);
}

export const shouldRevalidate = createDataTableShouldRevalidate({
  filterParamNames: [listTabParam, ...ownerPaymentFacetedFilterIds],
});

export default function IndividualFinancesRoute({
  loaderData,
}: Route.ComponentProps) {
  return <IndividualFinancesView loaderData={loaderData} />;
}
