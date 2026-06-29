import type { AdminRouteHandle } from "@/components/admin/shell";
import { loadAdministrativeAcademyAccountCurrentReport } from "@/features/admin/academies/account-current-report/server";
import { AdministracionAcademiasReporteCuentaCorrienteRouteView } from "@/features/admin/academies/account-current-report/view";

import type { Route } from "./+types/administracion.academias.reporte";

type LoaderData = Awaited<ReturnType<typeof loader>>;

type AdministracionAcademiasReporteCuentaCorrienteRouteProps = {
  loaderData: LoaderData;
};

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
  return await loadAdministrativeAcademyAccountCurrentReport(request);
}

export { AdministracionAcademiasReporteCuentaCorrienteRouteView };

export default function AdministracionAcademiasReporteCuentaCorrienteRoute({
  loaderData,
}: AdministracionAcademiasReporteCuentaCorrienteRouteProps) {
  return (
    <AdministracionAcademiasReporteCuentaCorrienteRouteView
      loaderData={loaderData}
    />
  );
}
