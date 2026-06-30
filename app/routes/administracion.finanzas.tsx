import type { AdminRouteHandle } from "@/components/admin/shell";
import { loadAdminFinanceAccountCurrentList } from "@/features/admin/finances/list/server";
import { AdministracionFinanzasRouteView } from "@/features/admin/finances/list/view";

import type { Route } from "./+types/administracion.finanzas";

type LoaderData = Awaited<ReturnType<typeof loader>>;

type AdministracionFinanzasRouteProps = {
  loaderData: LoaderData;
};

export const meta: Route.MetaFunction = () => [
  { title: "Resumen | Panel de administración | En Escena" },
];

export const handle = {
  adminBreadcrumbs: [{ label: "Resumen" }],
} satisfies AdminRouteHandle;

export async function loader({ request }: Route.LoaderArgs) {
  return await loadAdminFinanceAccountCurrentList(request);
}

export { AdministracionFinanzasRouteView };

export default function AdministracionFinanzasRoute({
  loaderData,
}: AdministracionFinanzasRouteProps) {
  return <AdministracionFinanzasRouteView loaderData={loaderData} />;
}
