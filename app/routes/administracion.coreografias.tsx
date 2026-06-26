import type { AdminRouteHandle } from "@/components/admin/shell";
import { loadAdministrativeChoreographyListRouteData } from "@/features/admin/choreographies/list/server";
import { AdministracionCoreografiasRouteView } from "@/features/admin/choreographies/list/view";

import type { Route } from "./+types/administracion.coreografias";

type LoaderData = Awaited<ReturnType<typeof loader>>;

type AdministracionCoreografiasRouteProps = {
  loaderData: LoaderData;
};

export const meta = () => [
  { title: "Coreografías | Panel de administración | En Escena" },
];

export const handle = {
  adminBreadcrumbs: [{ label: "Coreografías" }],
} satisfies AdminRouteHandle;

export async function loader({ request }: Route.LoaderArgs) {
  return await loadAdministrativeChoreographyListRouteData(request);
}

export { AdministracionCoreografiasRouteView };

export default function AdministracionCoreografiasRoute({
  loaderData,
}: AdministracionCoreografiasRouteProps) {
  return <AdministracionCoreografiasRouteView loaderData={loaderData} />;
}
