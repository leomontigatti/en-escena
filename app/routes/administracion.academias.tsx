import type { AdminRouteHandle } from "@/components/admin/shell";
import { loadAdminAcademiesList } from "@/features/admin/academies/list/server";
import { AcademiesListRouteView } from "@/features/admin/academies/list/view";

import type { Route } from "./+types/administracion.academias";

type LoaderData = Awaited<ReturnType<typeof loader>>;

type AdministracionAcademiasRouteProps = {
  loaderData: LoaderData;
};

export const meta: Route.MetaFunction = () => [
  { title: "Academias | Panel de administración | En Escena" },
];

export const handle = {
  adminBreadcrumbs: [{ label: "Academias" }],
} satisfies AdminRouteHandle;

export async function loader({ request }: Route.LoaderArgs) {
  return await loadAdminAcademiesList(request);
}

export { AcademiesListRouteView };

export default function AdministracionAcademiasRoute({
  loaderData,
}: AdministracionAcademiasRouteProps) {
  return <AcademiesListRouteView loaderData={loaderData} />;
}
