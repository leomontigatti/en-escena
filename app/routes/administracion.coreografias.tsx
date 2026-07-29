import type { AdminRouteHandle } from "@/components/admin/shell";
import { loadAdminChoreographyListRouteData } from "@/features/admin/choreographies/list/server";
import { ChoreographiesListRouteView } from "@/features/admin/choreographies/list/view";

import type { Route } from "./+types/administracion.coreografias";

type LoaderData = Awaited<ReturnType<typeof loader>>;

type ChoreographiesListRouteProps = {
  loaderData: LoaderData;
};

export const meta = () => [
  { title: "Coreografías | Panel de administración | En Escena" },
];

export const handle = {
  adminBreadcrumbs: [{ label: "Coreografías" }],
} satisfies AdminRouteHandle;

export async function loader({ request }: Route.LoaderArgs) {
  return await loadAdminChoreographyListRouteData(request);
}

export { ChoreographiesListRouteView };

export default function ChoreographiesListRoute({
  loaderData,
}: ChoreographiesListRouteProps) {
  return <ChoreographiesListRouteView loaderData={loaderData} />;
}
