import { redirect } from "react-router";

import type { AdminRouteHandle } from "@/components/admin/shell";

import type { Route } from "./+types/administracion.academias.reporte";

export const meta: Route.MetaFunction = () => [
  {
    title: "Reporte de cuenta corriente | Panel de administración | En Escena",
  },
];

export const handle = {
  adminBreadcrumbs: [
    { label: "Academias", to: "/administracion/academias" },
    { label: "Reporte de cuenta corriente" },
  ],
} satisfies AdminRouteHandle;

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);

  throw redirect(`/administracion/finanzas${url.search}`);
}

export default function AdministracionAcademiasReporteCuentaCorrienteRoute() {
  return null;
}
