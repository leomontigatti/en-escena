import type { AdminRouteHandle } from "@/components/admin/shell";
import { loadSeminarsList } from "@/features/admin/seminars/list/server";
import {
  SeminarsListView,
  type SeminarsListViewProps,
} from "@/features/admin/seminars/list/view";

import type { Route } from "./+types/administracion.seminarios";

export const handle = {
  adminBreadcrumbs: [{ label: "Seminarios" }],
} satisfies AdminRouteHandle;

export async function loader({ request }: Route.LoaderArgs) {
  return loadSeminarsList(request);
}

export function SeminarsListRouteView({ loaderData }: SeminarsListViewProps) {
  return <SeminarsListView loaderData={loaderData} />;
}

export default function SeminarsListRoute({
  loaderData,
}: SeminarsListViewProps) {
  return <SeminarsListRouteView loaderData={loaderData} />;
}
