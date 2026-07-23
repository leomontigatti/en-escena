import type { AdminRouteHandle } from "@/components/admin/shell";
import {
  handleAdminComprobantesListAction,
  loadAdminComprobantesList,
} from "@/features/admin/comprobantes/list/server";
import { AdministracionComprobantesRouteView } from "@/features/admin/comprobantes/list/view";

import type { Route } from "./+types/administracion.comprobantes";

type LoaderData = Awaited<ReturnType<typeof loader>>;

type AdministracionComprobantesRouteProps = {
  loaderData: LoaderData;
};

export const meta: Route.MetaFunction = () => [
  { title: "Comprobantes | Panel de administración | En Escena" },
];

export const handle = {
  adminBreadcrumbs: [{ label: "Comprobantes" }],
} satisfies AdminRouteHandle;

export async function loader({ request }: Route.LoaderArgs) {
  return await loadAdminComprobantesList(request);
}

export async function action({ request }: Route.ActionArgs) {
  return await handleAdminComprobantesListAction({ request });
}

export { AdministracionComprobantesRouteView };

export default function AdministracionComprobantesRoute({
  loaderData,
}: AdministracionComprobantesRouteProps) {
  return <AdministracionComprobantesRouteView loaderData={loaderData} />;
}
