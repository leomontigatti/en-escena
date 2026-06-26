import { useActionData } from "react-router";

import type { AdminRouteHandle } from "@/components/admin/shell";
import { createAdministrativeEventPrice } from "@/features/admin/event-prices/create/server";
import {
  AdministrativeEventPriceCreateView,
  type AdministrativeEventPriceCreateViewProps,
} from "@/features/admin/event-prices/create/view";
import { loadAdministrativeEventPricesList } from "@/features/admin/event-prices/list/server";

import type { Route } from "./+types/administracion.precios_.nuevo";

export const handle = {
  adminBreadcrumbs: [
    { label: "Precios", to: "/administracion/precios" },
    { label: "Nuevo precio" },
  ],
} satisfies AdminRouteHandle;

export async function loader({ request }: Route.LoaderArgs) {
  return loadAdministrativeEventPricesList(request);
}

export async function action({ request }: Route.ActionArgs) {
  return createAdministrativeEventPrice(request);
}

export function AdministracionPrecioNuevoRouteView({
  loaderData,
  actionData,
}: AdministrativeEventPriceCreateViewProps) {
  return (
    <AdministrativeEventPriceCreateView
      loaderData={loaderData}
      actionData={actionData}
    />
  );
}

export default function AdminNewPriceRoute({
  loaderData,
}: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();

  return (
    <AdministracionPrecioNuevoRouteView
      loaderData={loaderData}
      actionData={actionData}
    />
  );
}
