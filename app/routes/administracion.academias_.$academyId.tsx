import { useActionData } from "react-router";

import type { AdminRouteHandle } from "@/components/admin/shell";
import {
  handleAdministrativeAcademyAccountCurrentAction,
  loadAdministrativeAcademyAccountCurrent,
} from "@/features/admin/academies/account-current/server";
import { AdministracionAcademiaCuentaCorrienteRouteView as CuentaCorrienteView } from "@/features/admin/academies/account-current/view";

import type { Route } from "./+types/administracion.academias_.$academyId";

type LoaderData = Awaited<ReturnType<typeof loader>>;
type ActionData = Awaited<ReturnType<typeof action>>;

type AdministracionAcademiaCuentaCorrienteRouteProps = {
  actionData?: ActionData;
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

export async function action({ request, params }: Route.ActionArgs) {
  return await handleAdministrativeAcademyAccountCurrentAction({
    request,
    params,
  });
}

export function AdministracionAcademiaCuentaCorrienteRouteView({
  actionData: actionDataOverride,
  loaderData,
}: AdministracionAcademiaCuentaCorrienteRouteProps) {
  const actionData =
    actionDataOverride?.status === "error" ? actionDataOverride : undefined;

  return (
    <CuentaCorrienteView actionData={actionData} loaderData={loaderData} />
  );
}

export default function AdministracionAcademiaCuentaCorrienteRoute({
  loaderData,
}: AdministracionAcademiaCuentaCorrienteRouteProps) {
  const actionData = useActionData<typeof action>();

  return (
    <AdministracionAcademiaCuentaCorrienteRouteView
      loaderData={loaderData}
      actionData={actionData}
    />
  );
}
