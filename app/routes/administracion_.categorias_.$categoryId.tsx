import { useActionData } from "react-router";

import { EventCategoryDetailRouteView } from "@/components/admin/events/event-categories";

import { action, loader } from "@/lib/admin/events/bases-route.server";

import type { Route } from "./+types/administracion_.categorias_.$categoryId";

export { action, loader };

export default function AdminCategoryDetailRoute({
  loaderData,
  params,
}: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();

  return (
    <EventCategoryDetailRouteView
      loaderData={loaderData}
      actionData={actionData}
      categoryId={params.categoryId ?? ""}
    />
  );
}
