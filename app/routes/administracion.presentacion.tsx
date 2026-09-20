import type { AdminRouteHandle } from "@/components/admin/shell";
import {
  handlePresentationListAction,
  loadPresentationListRouteData,
} from "@/features/admin/presentations/list/server";
import { PresentationsListView } from "@/features/admin/presentations/list/view";
import { recoverableClientAction } from "@/lib/shared/recoverable-client-action";
import { useServerActionToast } from "@/lib/shared/toasts";

import type { Route } from "./+types/administracion.presentacion";

export const meta = () => [
  { title: "Presentación | Panel de administración | En Escena" },
];

export const handle = {
  adminBreadcrumbs: [{ label: "Presentación" }],
} satisfies AdminRouteHandle;

export async function loader({ request }: Route.LoaderArgs) {
  return await loadPresentationListRouteData(request);
}

export async function action({ request }: Route.ActionArgs) {
  return await handlePresentationListAction(request);
}

export async function clientAction({ serverAction }: Route.ClientActionArgs) {
  return await recoverableClientAction(serverAction);
}

export default function PresentationsListRoute({
  actionData,
  loaderData,
}: Route.ComponentProps) {
  useServerActionToast(actionData);

  return <PresentationsListView loaderData={loaderData} />;
}
