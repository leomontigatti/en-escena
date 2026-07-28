import { useActionData } from "react-router";

import type { AdminRouteHandle } from "@/components/admin/shell";
import {
  handleAdminProfessorDetailAction,
  loadAdminProfessorDetail,
} from "@/features/admin/professors/detail/server";
import type {
  ProfessorDetailActionData,
  ProfessorDetailLoaderData,
} from "@/features/admin/professors/detail/shared";
import { ProfessorDetailRouteView as ProfessorDetailView } from "@/features/admin/professors/detail/view";

import type { Route } from "./+types/administracion.profesores_.$professorId";

type LoaderData = ProfessorDetailLoaderData;
type ActionData = Awaited<ReturnType<typeof action>>;

type ProfessorDetailRouteProps = {
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
  return await loadAdminProfessorDetail({ request, params });
}

export async function action({
  request,
  params,
}: Route.ActionArgs): Promise<ProfessorDetailActionData> {
  return await handleAdminProfessorDetailAction({ request, params });
}

export function ProfessorDetailRouteView({
  loaderData,
  actionData,
}: ProfessorDetailRouteProps) {
  return (
    <ProfessorDetailView actionData={actionData} loaderData={loaderData} />
  );
}

export default function ProfessorDetailRoute({
  loaderData,
}: ProfessorDetailRouteProps) {
  const actionData = useActionData<typeof action>();

  return (
    <ProfessorDetailRouteView loaderData={loaderData} actionData={actionData} />
  );
}
