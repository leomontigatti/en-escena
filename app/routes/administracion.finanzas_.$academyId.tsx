import type { AdminRouteHandle } from "@/components/admin/shell";
import { loadAdministrativeAcademyFinanceDetail } from "@/features/admin/finances/academy-detail/server";
import { AdministracionAcademiaResumenFinancieroRouteView as ResumenFinancieroView } from "@/features/admin/finances/academy-detail/view";

import type { Route } from "./+types/administracion.finanzas_.$academyId";

type LoaderData = Awaited<ReturnType<typeof loader>>;

type AdministracionAcademiaResumenFinancieroRouteProps = {
  loaderData: LoaderData;
};

export const meta: Route.MetaFunction = () => [
  { title: "Resumen financiero | Panel de administración | En Escena" },
];

export const handle = {
  adminBreadcrumbs: [
    { label: "Resumen", to: "/administracion/finanzas" },
    (match) => {
      const data = match.data as LoaderData | undefined;
      return data?.academy ? { label: data.academy.name } : null;
    },
  ],
} satisfies AdminRouteHandle;

export async function loader({ request, params }: Route.LoaderArgs) {
  return await loadAdministrativeAcademyFinanceDetail({ request, params });
}

export function AdministracionAcademiaResumenFinancieroRouteView({
  loaderData,
}: AdministracionAcademiaResumenFinancieroRouteProps) {
  return <ResumenFinancieroView loaderData={loaderData} />;
}

export default function AdministracionAcademiaResumenFinancieroRoute({
  loaderData,
}: AdministracionAcademiaResumenFinancieroRouteProps) {
  return (
    <AdministracionAcademiaResumenFinancieroRouteView loaderData={loaderData} />
  );
}
