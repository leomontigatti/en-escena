import type { AdminRouteHandle } from "@/components/admin/shell";
import { loadMovementsList } from "@/features/admin/payments/list/server";
import { MovementsListRouteView } from "@/features/admin/payments/list/view";

import type { Route } from "./+types/administracion.movimientos";

type LoaderData = Awaited<ReturnType<typeof loader>>;

type MovementsListRouteProps = {
  loaderData: LoaderData;
};

export const meta: Route.MetaFunction = () => [
  { title: "Movimientos | Panel de administración | En Escena" },
];

export const handle = {
  adminBreadcrumbs: [{ label: "Movimientos" }],
} satisfies AdminRouteHandle;

export async function loader({ request }: Route.LoaderArgs) {
  return await loadMovementsList(request);
}

export default function MovementsListRoute({
  loaderData,
}: MovementsListRouteProps) {
  return <MovementsListRouteView loaderData={loaderData} />;
}
