import type { AdminRouteHandle } from "@/components/admin/shell";
import {
  handleGrandFinalListAction,
  loadGrandFinalListRouteData,
} from "@/features/admin/grand-final/list/server";
import { GrandFinalListView } from "@/features/admin/grand-final/list/view";
import { recoverableClientAction } from "@/lib/shared/recoverable-client-action";

import type { Route } from "./+types/administracion.gran-final";

export const meta = () => [
  { title: "Gran final | Panel de administración | En Escena" },
];

export const handle = {
  adminBreadcrumbs: [{ label: "Gran final" }],
} satisfies AdminRouteHandle;

export async function loader({ request }: Route.LoaderArgs) {
  return await loadGrandFinalListRouteData(request);
}

export async function action({ request }: Route.ActionArgs) {
  return await handleGrandFinalListAction(request);
}

export async function clientAction({ serverAction }: Route.ClientActionArgs) {
  return await recoverableClientAction(serverAction);
}

export default function GrandFinalListRoute({
  loaderData,
}: Route.ComponentProps) {
  return <GrandFinalListView loaderData={loaderData} />;
}
