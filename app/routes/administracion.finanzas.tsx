import type { AdminRouteHandle } from "@/components/admin/shell";
import { loadAdminFinancesList } from "@/features/admin/finances/list/server";
import { FinancesListRouteView } from "@/features/admin/finances/list/view";

import type { Route } from "./+types/administracion.finanzas";

type LoaderData = Awaited<ReturnType<typeof loader>>;

type FinancesListRouteProps = {
  loaderData: LoaderData;
};

export const meta: Route.MetaFunction = () => [
  { title: "Finanzas | Panel de administración | En Escena" },
];

export const handle = {
  adminBreadcrumbs: [{ label: "Finanzas" }],
} satisfies AdminRouteHandle;

export async function loader({ request }: Route.LoaderArgs) {
  return await loadAdminFinancesList(request);
}

export { FinancesListRouteView };

export default function FinancesListRoute({
  loaderData,
}: FinancesListRouteProps) {
  return <FinancesListRouteView loaderData={loaderData} />;
}
