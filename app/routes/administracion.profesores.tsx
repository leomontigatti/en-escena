import type { AdminRouteHandle } from "@/components/admin/shell";
import { loadProfessorsList } from "@/features/admin/professors/list/server";
import { ProfessorsListRouteView } from "@/features/admin/professors/list/view";

import type { Route } from "./+types/administracion.profesores";

type LoaderData = Awaited<ReturnType<typeof loader>>;

type ProfessorsListRouteProps = {
  loaderData: LoaderData;
};

export const meta: Route.MetaFunction = () => [
  { title: "Profesores | Panel de administración | En Escena" },
];

export const handle = {
  adminBreadcrumbs: [{ label: "Profesores" }],
} satisfies AdminRouteHandle;

export async function loader({ request }: Route.LoaderArgs) {
  return await loadProfessorsList(request);
}

export { ProfessorsListRouteView };

export default function ProfessorsListRoute({
  loaderData,
}: ProfessorsListRouteProps) {
  return <ProfessorsListRouteView loaderData={loaderData} />;
}
