import { useActionData } from "react-router";

import type { AdminRouteHandle } from "@/components/admin/shell";
import {
  handleAdminAcademyDetailAction,
  loadAdminAcademyDetail,
} from "@/features/admin/academies/detail/server";
import type {
  AcademyDetailActionData,
  AcademyDetailLoaderData,
} from "@/features/admin/academies/detail/shared";
import { AcademyDetailRouteView as AcademyDetailView } from "@/features/admin/academies/detail/view";

import type { Route } from "./+types/administracion.academias_.$academyId";

type AcademyDetailRouteProps = {
  loaderData: AcademyDetailLoaderData;
  actionData?: AcademyDetailActionData;
};

export const meta: Route.MetaFunction = () => [
  { title: "Detalle de academia | Panel de administración | En Escena" },
];

export const handle = {
  adminBreadcrumbs: [
    { label: "Academias", to: "/administracion/academias" },
    (match) => {
      const data = match.data as AcademyDetailLoaderData | undefined;
      return data?.academy ? { label: data.academy.name } : null;
    },
  ],
} satisfies AdminRouteHandle;

export async function loader({ request, params }: Route.LoaderArgs) {
  return await loadAdminAcademyDetail({ request, params });
}

export async function action({
  request,
  params,
}: Route.ActionArgs): Promise<AcademyDetailActionData> {
  return await handleAdminAcademyDetailAction({ request, params });
}

export function AcademyDetailRouteView({
  actionData,
  loaderData,
}: AcademyDetailRouteProps) {
  return <AcademyDetailView actionData={actionData} loaderData={loaderData} />;
}

export default function AcademyDetailRoute({
  loaderData,
}: AcademyDetailRouteProps) {
  const actionData = useActionData<typeof action>();

  return (
    <AcademyDetailRouteView actionData={actionData} loaderData={loaderData} />
  );
}
