import { useActionData } from "react-router";

import { NewEventCategoryRouteView } from "@/components/admin/events/event-categories";

import { action, loader } from "@/lib/admin/events/bases-route.server";

import type { Route } from "./+types/administracion_.categorias_.nueva";

export { action, loader };

export default function AdminNewCategoryRoute({
  loaderData,
}: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();

  return (
    <NewEventCategoryRouteView
      loaderData={loaderData}
      actionData={actionData}
    />
  );
}
