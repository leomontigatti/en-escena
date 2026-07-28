import { useActionData, type ShouldRevalidateFunction } from "react-router";

import type { AdminRouteHandle } from "@/components/admin/shell";
import {
  handleAdminChoreographyDetailAction,
  loadAdminChoreographyDetailRouteData,
  type AdministrativeChoreographyDetailActionData,
  type AdministrativeChoreographyDetailLoaderData,
} from "@/features/admin/choreographies/detail/server";
import { shouldRevalidateAdministrativeChoreographyDetail } from "@/features/admin/choreographies/detail/shared";
import { ChoreographyDetailRouteView as CoreografiaDetalleView } from "@/features/admin/choreographies/detail/view";

import type { Route } from "./+types/administracion.coreografias_.$choreographyId";

type LoaderData = AdministrativeChoreographyDetailLoaderData;
type ActionData = Awaited<ReturnType<typeof action>>;

type ChoreographyDetailRouteProps = {
  actionData?: ActionData;
  loaderData: LoaderData;
};

export const meta: Route.MetaFunction = () => [
  { title: "Detalle coreografía | Panel de administración | En Escena" },
];

export const handle = {
  adminBreadcrumbs: [
    { label: "Coreografías", to: "/administracion/coreografias" },
    (match) => {
      const data = match.data as LoaderData | undefined;
      return data?.choreography ? { label: data.choreography.name } : null;
    },
  ],
} satisfies AdminRouteHandle;

export async function loader({
  request,
  params,
}: Route.LoaderArgs): Promise<LoaderData> {
  return await loadAdminChoreographyDetailRouteData({
    request,
    params,
  });
}

export async function action({
  request,
  params,
}: Route.ActionArgs): Promise<
  AdministrativeChoreographyDetailActionData | Response
> {
  return await handleAdminChoreographyDetailAction({
    request,
    params,
  });
}

export const shouldRevalidate: ShouldRevalidateFunction = (arg) =>
  shouldRevalidateAdministrativeChoreographyDetail({
    defaultShouldRevalidate: arg.defaultShouldRevalidate,
    formData: arg.formData,
  });

function ChoreographyDetailRouteView({
  actionData: actionDataOverride,
  loaderData,
}: ChoreographyDetailRouteProps) {
  const actionData =
    actionDataOverride &&
    "status" in actionDataOverride &&
    (actionDataOverride.status === "error" ||
      actionDataOverride.status === "success")
      ? actionDataOverride
      : undefined;

  return (
    <CoreografiaDetalleView actionData={actionData} loaderData={loaderData} />
  );
}

export default function ChoreographyDetailRoute({
  loaderData,
}: ChoreographyDetailRouteProps) {
  const actionData = useActionData<typeof action>();

  return (
    <ChoreographyDetailRouteView
      actionData={actionData}
      loaderData={loaderData}
    />
  );
}
