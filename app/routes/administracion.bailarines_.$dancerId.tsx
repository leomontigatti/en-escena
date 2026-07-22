import { useActionData } from "react-router";

import type { AdminRouteHandle } from "@/components/admin/shell";
import {
  type DancerDetailActionData,
  type DancerDetailLoaderData,
} from "@/features/admin/dancers/detail/shared";
import {
  handleAdministrativeDancerDetailAction,
  loadAdministrativeDancerDetail,
} from "@/features/admin/dancers/detail/server";
import {
  AdministracionBailarinDetalleRouteView as BailarinDetalleView,
  type InscriptionsSectionProps,
  InscriptionsSection,
} from "@/features/admin/dancers/detail/view";

import type { Route } from "./+types/administracion.bailarines_.$dancerId";

type LoaderData = DancerDetailLoaderData;
type ActionData = Awaited<ReturnType<typeof action>>;

type AdministracionBailarinDetalleRouteProps = {
  loaderData: LoaderData;
  actionData?: ActionData;
};

export const meta: Route.MetaFunction = () => [
  { title: "Bailarín | Panel de administración | En Escena" },
];

export const handle = {
  adminBreadcrumbs: [
    { label: "Bailarines", to: "/administracion/bailarines" },
    (match) => {
      const data = match.data as LoaderData | undefined;
      const dancer = data?.dancer;
      return dancer
        ? { label: `${dancer.firstName} ${dancer.lastName}` }
        : null;
    },
  ],
} satisfies AdminRouteHandle;

export async function loader({ request, params }: Route.LoaderArgs) {
  return await loadAdministrativeDancerDetail({ request, params });
}

export async function action({
  request,
  params,
}: Route.ActionArgs): Promise<DancerDetailActionData> {
  return await handleAdministrativeDancerDetailAction({ request, params });
}

export function AdministracionBailarinDetalleRouteView({
  loaderData,
  actionData,
}: AdministracionBailarinDetalleRouteProps) {
  return (
    <BailarinDetalleView actionData={actionData} loaderData={loaderData} />
  );
}

export default function AdministracionBailarinDetalleRoute({
  loaderData,
}: AdministracionBailarinDetalleRouteProps) {
  const actionData = useActionData<typeof action>();

  return (
    <AdministracionBailarinDetalleRouteView
      loaderData={loaderData}
      actionData={actionData}
    />
  );
}

export { InscriptionsSection };
export type { InscriptionsSectionProps };
