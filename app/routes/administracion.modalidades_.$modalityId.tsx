import { useActionData } from "react-router";

import type { AdminRouteHandle } from "@/components/admin/shell";
import {
  loadAdministrativeEventModalityDetail,
  updateAdministrativeEventModality,
} from "@/features/admin/modalities/detail/server";
import {
  AdministrativeEventModalityDetailView,
  type AdministrativeEventModalityDetailViewProps,
} from "@/features/admin/modalities/detail/view";
import type { AdministrativeEventModalitiesLoaderData } from "@/features/admin/modalities/shared";

import type { Route } from "./+types/administracion.modalidades_.$modalityId";
type LoaderData = AdministrativeEventModalitiesLoaderData;

export const handle = {
  adminBreadcrumbs: [
    { label: "Modalidades", to: "/administracion/modalidades" },
    (match) => {
      const data = match.data as LoaderData | undefined;
      const modality = data?.modalities.find(
        (record) => record.id === match.params.modalityId,
      );
      return { label: modality?.name ?? "Modalidad" };
    },
  ],
} satisfies AdminRouteHandle;

export async function loader({ request }: Route.LoaderArgs) {
  return loadAdministrativeEventModalityDetail(request);
}

export async function action({ request }: Route.ActionArgs) {
  return updateAdministrativeEventModality(request);
}

export function AdministracionModalidadDetalleRouteView({
  loaderData,
  actionData,
  modalityId,
}: AdministrativeEventModalityDetailViewProps) {
  return (
    <AdministrativeEventModalityDetailView
      loaderData={loaderData}
      actionData={actionData}
      modalityId={modalityId}
    />
  );
}

export default function AdministracionModalidadDetalleRoute({
  loaderData,
  params,
}: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();

  return (
    <AdministracionModalidadDetalleRouteView
      loaderData={loaderData}
      actionData={actionData}
      modalityId={params.modalityId ?? ""}
    />
  );
}
