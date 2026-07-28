import type { AdminRouteHandle } from "@/components/admin/shell";
import {
  handleAdminChoreographyFinanceAction,
  loadAdminChoreographyFinanceDetail,
} from "@/features/admin/finances/academy-choreographies/choreography-detail/server";
import { AdministracionCoreografiaFinancieraDetalleView } from "@/features/admin/finances/academy-choreographies/choreography-detail/view";

import type { Route } from "./+types/administracion.finanzas_.$academyId_.coreografias_.$choreographyId";

type LoaderData = Awaited<ReturnType<typeof loader>>;

type AdministracionCoreografiaFinancieraDetalleRouteProps = {
  loaderData: LoaderData;
};

export const meta: Route.MetaFunction = () => [
  { title: "Detalle financiero | Panel de administración | En Escena" },
];

export const handle = {
  adminBreadcrumbs: [
    { label: "Finanzas", to: "/administracion/finanzas" },
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
  return await loadAdminChoreographyFinanceDetail({
    request,
    params,
  });
}

export async function action({ request, params }: Route.ActionArgs) {
  return await handleAdminChoreographyFinanceAction({
    request,
    params,
  });
}

function ChoreographyFinanceDetailRouteView({
  loaderData,
}: AdministracionCoreografiaFinancieraDetalleRouteProps) {
  return (
    <AdministracionCoreografiaFinancieraDetalleView loaderData={loaderData} />
  );
}

export default function AdministracionCoreografiaFinancieraDetalleRoute({
  loaderData,
}: AdministracionCoreografiaFinancieraDetalleRouteProps) {
  return <ChoreographyFinanceDetailRouteView loaderData={loaderData} />;
}
