import { useActionData } from "react-router";

import type { AdminRouteHandle } from "@/components/admin/shell";
import {
  createAdministrativeSeminarPrice,
  loadSeminarPriceCreate,
} from "@/features/admin/seminar-prices/create/server";
import {
  SeminarPriceCreateView,
  type SeminarPriceCreateViewProps,
} from "@/features/admin/seminar-prices/create/view";
import { seminarPricesListPath } from "@/features/admin/seminar-prices/shared";

import type { Route } from "./+types/administracion.precios_.seminarios_.nuevo";

export const handle = {
  adminBreadcrumbs: [
    { label: "Precios", to: seminarPricesListPath },
    { label: "Nuevo precio de seminario" },
  ],
} satisfies AdminRouteHandle;

export async function loader({ request }: Route.LoaderArgs) {
  return loadSeminarPriceCreate(request);
}

export async function action({ request }: Route.ActionArgs) {
  return createAdministrativeSeminarPrice(request);
}

export function NewSeminarPriceRouteView({
  loaderData,
  actionData,
}: SeminarPriceCreateViewProps) {
  return (
    <SeminarPriceCreateView loaderData={loaderData} actionData={actionData} />
  );
}

export default function NewSeminarPriceRoute({
  loaderData,
}: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();

  return (
    <NewSeminarPriceRouteView loaderData={loaderData} actionData={actionData} />
  );
}
