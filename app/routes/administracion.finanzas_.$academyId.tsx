import { useActionData } from "react-router";

import type { AdminRouteHandle } from "@/components/admin/shell";
import {
  handleAdministrativeAcademyAccountCurrentAction,
  loadAdministrativeAcademyAccountCurrent,
} from "@/features/admin/academies/account-current/server";
import { AdministracionAcademiaCuentaCorrienteRouteView as CuentaCorrienteView } from "@/features/admin/academies/account-current/view";

import type { Route } from "./+types/administracion.finanzas_.$academyId";

type LoaderData = Awaited<ReturnType<typeof loader>>;
type ActionData = Awaited<ReturnType<typeof action>>;

type AdministracionFinanzasCuentaCorrienteRouteProps = {
  actionData?: ActionData;
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

export async function action({ request, params }: Route.ActionArgs) {
  return await handleAdministrativeAcademyAccountCurrentAction({
    request,
    params,
  });
}

export function AdministracionFinanzasCuentaCorrienteRouteView({
  actionData: actionDataOverride,
  loaderData,
}: AdministracionFinanzasCuentaCorrienteRouteProps) {
  return (
    <CuentaCorrienteView
      actionData={actionDataOverride}
      loaderData={loaderData}
    />
  );
}

export default function AdministracionFinanzasCuentaCorrienteRoute({
  loaderData,
}: AdministracionFinanzasCuentaCorrienteRouteProps) {
  const actionData = useActionData<typeof action>();

  return (
    <AdministracionFinanzasCuentaCorrienteRouteView
      loaderData={loaderData}
      actionData={actionData}
    />
  );
}
