import { useActionData } from "react-router";

import type { AdminRouteHandle } from "@/components/admin/shell";
import {
  handleAdministrativeAcademyDetailAction,
  loadAdministrativeAcademyDetail,
} from "@/features/admin/academies/detail/server";
import type { AcademyDetailActionData } from "@/features/admin/academies/detail/shared";
import { AdministracionAcademiaDetalleRouteView as AcademiaDetalleView } from "@/features/admin/academies/detail/view";

import type { Route } from "./+types/administracion.academias_.$academyId";

type LoaderData = Awaited<ReturnType<typeof loader>>;

type AdministracionAcademiaDetalleRouteProps = {
  loaderData: LoaderData;
  actionData?: AcademyDetailActionData;
};

export const meta: Route.MetaFunction = () => [
  { title: "Detalle de academia | Panel de administración | En Escena" },
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
  return await loadAdministrativeAcademyDetail({ request, params });
}

export async function action({
  request,
  params,
}: Route.ActionArgs): Promise<AcademyDetailActionData> {
  return await handleAdministrativeAcademyDetailAction({ request, params });
}

export function AdministracionAcademiaDetalleRouteView({
  actionData,
  loaderData,
}: AdministracionAcademiaDetalleRouteProps) {
  return (
    <AcademiaDetalleView actionData={actionData} loaderData={loaderData} />
  );
}

export default function AdministracionAcademiaDetalleRoute({
  loaderData,
}: AdministracionAcademiaDetalleRouteProps) {
  const actionData = useActionData<typeof action>();

  return (
    <AdministracionAcademiaDetalleRouteView
      actionData={actionData}
      loaderData={loaderData}
    />
  );
}
