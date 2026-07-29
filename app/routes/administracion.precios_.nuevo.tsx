import { useActionData } from "react-router";

import type { AdminRouteHandle } from "@/components/admin/shell";
import {
  createAdministrativeEventPrice,
  loadEventPriceCreate,
} from "@/features/admin/prices/create/server";
import {
  EventPriceCreateView,
  type EventPriceCreateViewProps,
} from "@/features/admin/prices/create/view";

import type { Route } from "./+types/administracion.precios_.nuevo";

export const handle = {
  adminBreadcrumbs: [
    { label: "Precios", to: "/administracion/precios" },
    { label: "Nuevo precio" },
  ],
} satisfies AdminRouteHandle;

export async function loader({ request }: Route.LoaderArgs) {
  return loadEventPriceCreate(request);
}

export async function action({ request }: Route.ActionArgs) {
  return createAdministrativeEventPrice(request);
}

export function NewPriceRouteView({
  loaderData,
  actionData,
}: EventPriceCreateViewProps) {
  return (
    <EventPriceCreateView loaderData={loaderData} actionData={actionData} />
  );
}

export default function NewPriceRoute({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();

  return <NewPriceRouteView loaderData={loaderData} actionData={actionData} />;
}
