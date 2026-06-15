import { useActionData } from "react-router";

import { action, loader } from "@/lib/admin/events/bases-route.server";
import { EventModalityDetailRouteView } from "@/components/admin/events/event-modalities";

import type { Route } from "./+types/administracion_.modalidades_.$modalityId";

export { action, loader };

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
