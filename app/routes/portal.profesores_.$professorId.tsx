import { useActionData } from "react-router";

import type { PortalRouteHandle } from "@/components/portal/ui";
import {
  handlePortalProfessorDetailAction,
  loadPortalProfessorDetail,
} from "@/features/portal/professors/detail/server";
import {
  PortalProfessorDetailRouteView,
  type PortalProfessorDetailRouteViewProps,
} from "@/features/portal/professors/detail/view";
import { type PortalProfessorDetailLoaderData } from "@/features/portal/professors/detail/shared";

type LoaderData = PortalProfessorDetailRouteViewProps["loaderData"];

type PortalProfessorDetailRouteProps = {
  loaderData: LoaderData;
};

export const meta = () => [
  { title: "Editar profesor | Portal de academias | En Escena" },
];

export const handle = {
  portalBreadcrumbs: [
    { label: "Profesores", to: "/portal/profesores" },
    (match) => {
      const data = match.data as PortalProfessorDetailLoaderData | undefined;
      const professor = data?.professor;

      return professor
        ? { label: `${professor.firstName} ${professor.lastName}` }
        : null;
    },
  ],
} satisfies PortalRouteHandle;

export async function loader({
  request,
  params,
}: {
  request: Request;
  params: { professorId?: string };
}) {
  return await loadPortalProfessorDetail({ request, params });
}

export async function action({
  request,
  params,
}: {
  request: Request;
  params: { professorId?: string };
}) {
  return await handlePortalProfessorDetailAction({ request, params });
}

export const PortalProfesorRouteView = PortalProfessorDetailRouteView;

export default function PortalProfesorRoute({
  loaderData,
}: PortalProfessorDetailRouteProps) {
  const actionData = useActionData<typeof action>();

  return (
    <PortalProfessorDetailRouteView
      loaderData={loaderData}
      actionData={actionData}
    />
  );
}
