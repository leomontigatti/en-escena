import { useActionData } from "react-router";

import { action, loader } from "@/lib/admin/events/bases-route.server";
import { EventModalityDetailRouteView } from "@/components/admin/events/event-modalities";
import type { AdminRouteHandle } from "@/components/admin/shell";

import type { Route } from "./+types/administracion.modalidades_.$modalityId";

export { action, loader };

type LoaderData = Route.ComponentProps["loaderData"];

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

export default function AdminModalityDetailRoute({
  loaderData,
  params,
}: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();

  return (
    <EventModalityDetailRouteView
      loaderData={loaderData}
      actionData={actionData}
      modalityId={params.modalityId ?? ""}
    />
  );
}
