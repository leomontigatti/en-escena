import { useActionData } from "react-router";

import type { AdminRouteHandle } from "@/components/admin/shell";
import {
  loadAdminEventModalityDetail,
  updateAdministrativeEventModality,
} from "@/features/admin/modalities/detail/server";
import {
  EventModalityDetailView,
  type EventModalityDetailViewProps,
} from "@/features/admin/modalities/detail/view";
import type { EventModalitiesLoaderData } from "@/features/admin/modalities/shared";

import type { Route } from "./+types/administracion.modalidades_.$modalityId";
type LoaderData = EventModalitiesLoaderData;

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
  return loadAdminEventModalityDetail(request);
}

export async function action({ request }: Route.ActionArgs) {
  return updateAdministrativeEventModality(request);
}

export function ModalityDetailRouteView({
  loaderData,
  actionData,
  modalityId,
}: EventModalityDetailViewProps) {
  return (
    <EventModalityDetailView
      loaderData={loaderData}
      actionData={actionData}
      modalityId={modalityId}
    />
  );
}

export default function ModalityDetailRoute({
  loaderData,
  params,
}: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();

  return (
    <ModalityDetailRouteView
      loaderData={loaderData}
      actionData={actionData}
      modalityId={params.modalityId ?? ""}
    />
  );
}
