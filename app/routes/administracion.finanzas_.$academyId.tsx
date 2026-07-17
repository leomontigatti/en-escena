import type { AdminRouteHandle } from "@/components/admin/shell";
import { loadAdministrativeAcademyAccountCurrent } from "@/features/admin/academies/account-current/server";
import { AdministracionAcademiaCuentaCorrienteRouteView as CuentaCorrienteView } from "@/features/admin/academies/account-current/view";

import type { Route } from "./+types/administracion.finanzas_.$academyId";

type LoaderData = Awaited<ReturnType<typeof loader>>;

type AdministracionFinanzasCuentaCorrienteRouteProps = {
  loaderData: LoaderData;
};

export const meta: Route.MetaFunction = () => [
  { title: "Cuenta corriente | Panel de administración | En Escena" },
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
  return await loadAdministrativeAcademyAccountCurrent({ request, params });
}

function AdministracionFinanzasCuentaCorrienteRouteView({
  loaderData,
}: AdministracionFinanzasCuentaCorrienteRouteProps) {
  return (
    <CuentaCorrienteView
      loaderData={loaderData}
      selectableChoreographyRows={false}
    />
  );
}

export default function AdministracionFinanzasCuentaCorrienteRoute({
  loaderData,
}: AdministracionFinanzasCuentaCorrienteRouteProps) {
  return (
    <AdministracionFinanzasCuentaCorrienteRouteView loaderData={loaderData} />
  );
}
