import type { AdminRouteHandle } from "@/components/admin/shell";
import { loadAdministrativeAcademyAccountCurrent } from "@/features/admin/academies/account-current/server";
import { AdministracionAcademiaCuentaCorrienteRouteView as CuentaCorrienteView } from "@/features/admin/academies/account-current/view";

import type { Route } from "./+types/administracion.academias_.$academyId";

type LoaderData = Awaited<ReturnType<typeof loader>>;

type AdministracionAcademiaCuentaCorrienteRouteProps = {
  loaderData: LoaderData;
};

export const meta: Route.MetaFunction = () => [
  { title: "Cuenta corriente | Panel de administración | En Escena" },
];

export const handle = {
  adminBreadcrumbs: [
    { label: "Academias", to: "/administracion/academias" },
    (match) => {
      const data = match.data as LoaderData | undefined;
      return data?.academy ? { label: data.academy.name } : null;
    },
  ],
} satisfies AdminRouteHandle;

export async function loader({ request, params }: Route.LoaderArgs) {
  return await loadAdministrativeAcademyAccountCurrent({ request, params });
}

export function AdministracionAcademiaCuentaCorrienteRouteView({
  loaderData,
}: AdministracionAcademiaCuentaCorrienteRouteProps) {
  return <CuentaCorrienteView loaderData={loaderData} />;
}

export default function AdministracionAcademiaCuentaCorrienteRoute({
  loaderData,
}: AdministracionAcademiaCuentaCorrienteRouteProps) {
  return (
    <AdministracionAcademiaCuentaCorrienteRouteView loaderData={loaderData} />
  );
}
