import { useActionData } from "react-router";

import type { AdminRouteHandle } from "@/components/admin/shell";
import {
  loadSeminarPriceDetail,
  updateAdministrativeSeminarPrice,
} from "@/features/admin/seminar-prices/detail/server";
import {
  getSeminarPriceDisplayName,
  SeminarPriceDetailView,
  type SeminarPriceDetailViewProps,
} from "@/features/admin/seminar-prices/detail/view";
import type { SeminarPricesListLoaderData } from "@/features/admin/seminar-prices/shared";
import { seminarPricesListPath } from "@/features/admin/seminar-prices/shared";

import type { Route } from "./+types/administracion.precios_.seminarios_.$seminarPriceId";

type LoaderData = SeminarPricesListLoaderData;

export const handle = {
  adminBreadcrumbs: [
    { label: "Precios", to: seminarPricesListPath },
    (match) => {
      const data = match.data as LoaderData | undefined;
      const seminarPrice = data?.seminarPrices.find(
        (item) => item.id === match.params.seminarPriceId,
      );

      return { label: getSeminarPriceDisplayName(seminarPrice) };
    },
  ],
} satisfies AdminRouteHandle;

export async function loader({ request }: Route.LoaderArgs) {
  return loadSeminarPriceDetail(request);
}

export async function action({ request }: Route.ActionArgs) {
  return updateAdministrativeSeminarPrice(request);
}

export function SeminarPriceDetailRouteView({
  loaderData,
  actionData,
  seminarPriceId,
}: SeminarPriceDetailViewProps) {
  return (
    <SeminarPriceDetailView
      loaderData={loaderData}
      actionData={actionData}
      seminarPriceId={seminarPriceId}
    />
  );
}

export default function SeminarPriceDetailRoute({
  loaderData,
  params,
}: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();

  return (
    <SeminarPriceDetailRouteView
      loaderData={loaderData}
      actionData={actionData}
      seminarPriceId={params.seminarPriceId ?? ""}
    />
  );
}
