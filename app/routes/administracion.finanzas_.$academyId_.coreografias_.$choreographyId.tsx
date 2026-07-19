import { useSearchParams } from "react-router";

import type { AdminRouteHandle } from "@/components/admin/shell";
import {
  handleAdministrativeChoreographyFinanceAction,
  loadAdministrativeChoreographyFinanceDetail,
} from "@/features/admin/academies/account-current/choreography-detail/server";
import { AdministracionCoreografiaFinancieraDetalleView } from "@/features/admin/academies/account-current/choreography-detail/view";
// PROTOTIPO #339 (throwaway): renderiza las variantes cuando hay ?variant= en la URL.
import { DetailPrototype } from "@/features/admin/_prototype-339/detail-variants";

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

export async function action({ request, params }: Route.ActionArgs) {
  return await handleAdministrativeChoreographyFinanceAction({
    request,
    params,
  });
}

function AdministracionCoreografiaFinancieraDetalleRouteView({
  loaderData,
}: AdministracionCoreografiaFinancieraDetalleRouteProps) {
  // PROTOTIPO #339: con ?variant=A|B|C se muestran las variantes de diseño en
  // vez de la vista real. Sin el search param, la vista real queda intacta.
  const [params] = useSearchParams();
  if (!import.meta.env.PROD && params.has("variant")) {
    return <DetailPrototype />;
  }
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
