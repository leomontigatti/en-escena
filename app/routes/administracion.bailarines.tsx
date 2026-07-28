import type { AdminRouteHandle } from "@/components/admin/shell";
import { loadAdminDancersList } from "@/features/admin/dancers/list/server";
import { DancersListRouteView } from "@/features/admin/dancers/list/view";

import type { Route } from "./+types/administracion.bailarines";

type LoaderData = Awaited<ReturnType<typeof loader>>;

type AdministracionBailarinesRouteProps = {
  loaderData: LoaderData;
};

export const meta: Route.MetaFunction = () => [
  { title: "Bailarines | Panel de administración | En Escena" },
];

export const handle = {
  adminBreadcrumbs: [{ label: "Bailarines" }],
} satisfies AdminRouteHandle;

export async function loader({ request }: Route.LoaderArgs) {
  return await loadAdminDancersList(request);
}

export { DancersListRouteView };

export default function AdministracionBailarinesRoute({
  loaderData,
}: AdministracionBailarinesRouteProps) {
  return <DancersListRouteView loaderData={loaderData} />;
}
