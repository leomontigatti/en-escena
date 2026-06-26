import type { AdminRouteHandle } from "@/components/admin/shell";
import { loadAdministrativeDancersList } from "@/features/admin/dancers/list/server";
import { AdministracionBailarinesRouteView } from "@/features/admin/dancers/list/view";

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
  return await loadAdministrativeDancersList(request);
}

export { AdministracionBailarinesRouteView };

export default function AdministracionBailarinesRoute({
  loaderData,
}: AdministracionBailarinesRouteProps) {
  return <AdministracionBailarinesRouteView loaderData={loaderData} />;
}
