import type { AdminRouteHandle } from "@/components/admin/shell";
import { loadAdministrativeProfessorsList } from "@/features/admin/professors/list/server";
import { AdministracionProfesoresRouteView } from "@/features/admin/professors/list/view";

import type { Route } from "./+types/administracion.profesores";

type LoaderData = Awaited<ReturnType<typeof loader>>;

type AdministracionProfesoresRouteProps = {
  loaderData: LoaderData;
};

export const meta: Route.MetaFunction = () => [
  { title: "Profesores | Panel de administración | En Escena" },
];

export const handle = {
  adminBreadcrumbs: [{ label: "Profesores" }],
} satisfies AdminRouteHandle;

export async function loader({ request }: Route.LoaderArgs) {
  return await loadAdministrativeProfessorsList(request);
}

export { AdministracionProfesoresRouteView };

export default function AdministracionProfesoresRoute({
  loaderData,
}: AdministracionProfesoresRouteProps) {
  return <AdministracionProfesoresRouteView loaderData={loaderData} />;
}
