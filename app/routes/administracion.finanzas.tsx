import type { AdminRouteHandle } from "@/components/admin/shell";
import { createDataTableShouldRevalidate } from "@/components/shared/data-table-revalidation";
import { loadFinancesList } from "@/features/admin/finances/list/server";
import {
  financesListFacetedFilterIds,
  FinancesListRouteView,
} from "@/features/admin/finances/list/view";

import type { Route } from "./+types/administracion.finanzas";

type LoaderData = Awaited<ReturnType<typeof loader>>;

type FinancesListRouteProps = {
  loaderData: LoaderData;
};

export const meta: Route.MetaFunction = () => [
  { title: "Saldos | Finanzas | Panel de administración | En Escena" },
];

export const handle = {
  adminBreadcrumbs: [{ label: "Saldos" }],
} satisfies AdminRouteHandle;

export async function loader({ request }: Route.LoaderArgs) {
  return await loadFinancesList(request);
}

export const shouldRevalidate = createDataTableShouldRevalidate({
  filterParamNames: [...financesListFacetedFilterIds],
});

export { FinancesListRouteView };

export default function FinancesListRoute({
  loaderData,
}: FinancesListRouteProps) {
  return <FinancesListRouteView loaderData={loaderData} />;
}
