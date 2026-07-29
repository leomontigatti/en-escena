import type { AdminRouteHandle } from "@/components/admin/shell";
import { loadComprobantesList } from "@/features/admin/comprobantes/list/server";
import { ComprobantesListRouteView } from "@/features/admin/comprobantes/list/view";

import type { Route } from "./+types/administracion.comprobantes";

type LoaderData = Awaited<ReturnType<typeof loader>>;

type ComprobantesListRouteProps = {
  loaderData: LoaderData;
};

export const meta: Route.MetaFunction = () => [
  { title: "Comprobantes | Panel de administración | En Escena" },
];

export const handle = {
  adminBreadcrumbs: [{ label: "Comprobantes" }],
} satisfies AdminRouteHandle;

export async function loader({ request }: Route.LoaderArgs) {
  return await loadComprobantesList(request);
}

export { ComprobantesListRouteView };

export default function ComprobantesListRoute({
  loaderData,
}: ComprobantesListRouteProps) {
  return <ComprobantesListRouteView loaderData={loaderData} />;
}
