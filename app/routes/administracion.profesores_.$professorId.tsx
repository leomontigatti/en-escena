import { useActionData } from "react-router";

import type { AdminRouteHandle } from "@/components/admin/shell";
import {
  handleAdministrativeProfessorDetailAction,
  loadAdministrativeProfessorDetail,
} from "@/features/admin/professors/detail/server";
import type {
  ProfessorDetailActionData,
  ProfessorDetailLoaderData,
} from "@/features/admin/professors/detail/shared";
import { AdministracionProfesorDetalleRouteView as ProfesorDetalleView } from "@/features/admin/professors/detail/view";

import type { Route } from "./+types/administracion.profesores_.$professorId";

type LoaderData = ProfessorDetailLoaderData;
type ActionData = Awaited<ReturnType<typeof action>>;

type AdministracionProfesorDetalleRouteProps = {
  loaderData: LoaderData;
  actionData?: ActionData;
};

export const meta: Route.MetaFunction = () => [
  { title: "Detalle profesor | Panel de administración | En Escena" },
];

export const handle = {
  adminBreadcrumbs: [
    { label: "Profesores", to: "/administracion/profesores" },
    (match) => {
      const data = match.data as LoaderData | undefined;
      const professor = data?.professor;
      return professor
        ? { label: `${professor.firstName} ${professor.lastName}` }
        : null;
    },
  ],
} satisfies AdminRouteHandle;

export async function loader({
  request,
  params,
}: Route.LoaderArgs): Promise<LoaderData> {
  return await loadAdministrativeProfessorDetail({ request, params });
}

export async function action({
  request,
  params,
}: Route.ActionArgs): Promise<ProfessorDetailActionData> {
  return await handleAdministrativeProfessorDetailAction({ request, params });
}

export function AdministracionProfesorDetalleRouteView({
  loaderData,
  actionData,
}: AdministracionProfesorDetalleRouteProps) {
  return (
    <ProfesorDetalleView actionData={actionData} loaderData={loaderData} />
  );
}

export default function AdministracionProfesorDetalleRoute({
  loaderData,
}: AdministracionProfesorDetalleRouteProps) {
  const actionData = useActionData<typeof action>();

  return (
    <AdministracionProfesorDetalleRouteView
      loaderData={loaderData}
      actionData={actionData}
    />
  );
}
