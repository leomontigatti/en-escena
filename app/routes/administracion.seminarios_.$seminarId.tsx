import { useActionData } from "react-router";

import type { AdminRouteHandle } from "@/components/admin/shell";
import {
  loadSeminarDetail,
  updateAdministrativeSeminar,
} from "@/features/admin/seminars/detail/server";
import {
  SeminarDetailView,
  type SeminarDetailViewProps,
} from "@/features/admin/seminars/detail/view";
import type { SeminarDetailLoaderData } from "@/features/admin/seminars/shared";

import type { Route } from "./+types/administracion.seminarios_.$seminarId";

export const handle = {
  adminBreadcrumbs: [
    { label: "Seminarios", to: "/administracion/seminarios" },
    (match) => {
      const data = match.data as SeminarDetailLoaderData | undefined;

      return { label: data?.seminar.instructorName ?? "Seminario" };
    },
  ],
} satisfies AdminRouteHandle;

export async function loader({ params, request }: Route.LoaderArgs) {
  return loadSeminarDetail(request, params.seminarId ?? "");
}

export async function action({ params, request }: Route.ActionArgs) {
  return updateAdministrativeSeminar(request, params.seminarId ?? "");
}

export function SeminarDetailRouteView({
  loaderData,
  actionData,
}: SeminarDetailViewProps) {
  return <SeminarDetailView loaderData={loaderData} actionData={actionData} />;
}

export default function SeminarDetailRoute({
  loaderData,
}: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();

  return (
    <SeminarDetailRouteView loaderData={loaderData} actionData={actionData} />
  );
}
