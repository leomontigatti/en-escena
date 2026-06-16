import { useActionData } from "react-router";

import { action, loader } from "@/lib/admin/events/bases-route.server";
import { NewEventModalityRouteView } from "@/components/admin/events/event-modalities";
import type { AdminRouteHandle } from "@/components/admin/shell";

import type { Route } from "./+types/administracion.modalidades_.nueva";

export { action, loader };

export const handle = {
  adminBreadcrumbs: [
    { label: "Modalidades", to: "/administracion/modalidades" },
    { label: "Nueva" },
  ],
} satisfies AdminRouteHandle;

export default function AdminNewModalityRoute({
  loaderData,
}: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();

  return (
    <NewEventModalityRouteView
      loaderData={loaderData}
      actionData={actionData}
    />
  );
}
