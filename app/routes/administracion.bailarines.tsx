import type { AdminRouteHandle } from "@/components/admin/shell";
import { loadDancersList } from "@/features/admin/dancers/list/server";
import { DancersListRouteView } from "@/features/admin/dancers/list/view";

import type { Route } from "./+types/administracion.bailarines";

type LoaderData = Awaited<ReturnType<typeof loader>>;

type DancersListRouteProps = {
  loaderData: LoaderData;
};

export const meta: Route.MetaFunction = () => [
  { title: "Bailarines | Panel de administración | En Escena" },
];

export const handle = {
  adminBreadcrumbs: [{ label: "Bailarines" }],
} satisfies AdminRouteHandle;

export async function loader({ request }: Route.LoaderArgs) {
  return await loadDancersList(request);
}

export { DancersListRouteView };

export default function DancersListRoute({
  loaderData,
}: DancersListRouteProps) {
  return <DancersListRouteView loaderData={loaderData} />;
}
