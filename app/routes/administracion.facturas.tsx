import { redirect } from "react-router";

import type { AdminRouteHandle } from "@/components/admin/shell";
import { loadAdminInvoicesList } from "@/features/admin/invoices/list/server";
import { AdministracionFacturasRouteView } from "@/features/admin/invoices/list/view";

import type { Route } from "./+types/administracion.facturas";

type LoaderData = Awaited<ReturnType<typeof loadAdminInvoicesList>>;

type AdministracionFacturasRouteProps = {
  loaderData: LoaderData;
};

export const meta: Route.MetaFunction = () => [
  { title: "Facturas | Panel de administración | En Escena" },
];

export const handle = {
  adminBreadcrumbs: [{ label: "Facturas" }],
} satisfies AdminRouteHandle;

export async function loader(_args?: Route.LoaderArgs) {
  throw redirect("/administracion");
}

export { AdministracionFacturasRouteView };

export default function AdministracionFacturasRoute({
  loaderData,
}: AdministracionFacturasRouteProps) {
  return <AdministracionFacturasRouteView loaderData={loaderData} />;
}
