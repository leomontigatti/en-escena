import type { AdminRouteHandle } from "@/components/admin/shell";
import { loadAdministrativeChoreographyFinanceDetail } from "@/features/admin/academies/account-current/choreography-detail/server";
import { AdministracionCoreografiaFinancieraDetalleView } from "@/features/admin/academies/account-current/choreography-detail/view";

import type { Route } from "./+types/administracion.finanzas_.$academyId_.coreografias_.$choreographyId";

type LoaderData = Awaited<ReturnType<typeof loader>>;

type AdministracionCoreografiaFinancieraDetalleRouteProps = {
  loaderData: LoaderData;
};

export const meta: Route.MetaFunction = () => [
  {
    title:
      "Detalle financiero de coreografía | Panel de administración | En Escena",
  },
];

export const handle = {
  adminBreadcrumbs: [
    { label: "Resumen", to: "/administracion/finanzas" },
    (match) => {
      const data = match.data as LoaderData | undefined;
      return data?.academy
        ? {
            label: data.academy.name,
            to: `/administracion/finanzas/${data.academy.id}`,
          }
        : null;
    },
    (match) => {
      const data = match.data as LoaderData | undefined;
      return data?.choreography ? { label: data.choreography.name } : null;
    },
  ],
} satisfies AdminRouteHandle;

export async function loader({ request, params }: Route.LoaderArgs) {
  return await loadAdministrativeChoreographyFinanceDetail({
    request,
    params,
  });
}

function AdministracionCoreografiaFinancieraDetalleRouteView({
  loaderData,
}: AdministracionCoreografiaFinancieraDetalleRouteProps) {
  return (
    <AdministracionCoreografiaFinancieraDetalleView loaderData={loaderData} />
  );
}

export default function AdministracionCoreografiaFinancieraDetalleRoute({
  loaderData,
}: AdministracionCoreografiaFinancieraDetalleRouteProps) {
  return (
    <AdministracionCoreografiaFinancieraDetalleRouteView
      loaderData={loaderData}
    />
  );
}
