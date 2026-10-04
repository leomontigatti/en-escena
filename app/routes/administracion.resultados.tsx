import type { AdminRouteHandle } from "@/components/admin/shell";
import {
  handleResultsListAction,
  loadResultsListRouteData,
} from "@/features/admin/results/list/server";
import { ResultsListView } from "@/features/admin/results/list/view";
import { recoverableClientAction } from "@/lib/shared/recoverable-client-action";
import { useServerActionToast } from "@/lib/shared/toasts";

import type { Route } from "./+types/administracion.resultados";

export const meta = () => [
  { title: "Resultados | Panel de administración | En Escena" },
];

export const handle = {
  adminBreadcrumbs: [{ label: "Resultados" }],
} satisfies AdminRouteHandle;

export async function loader({ request }: Route.LoaderArgs) {
  return await loadResultsListRouteData(request);
}

export async function action({ request }: Route.ActionArgs) {
  return await handleResultsListAction(request);
}

export async function clientAction({ serverAction }: Route.ClientActionArgs) {
  return await recoverableClientAction(serverAction);
}

export default function ResultsListRoute({
  actionData,
  loaderData,
}: Route.ComponentProps) {
  useServerActionToast(actionData);

  return <ResultsListView loaderData={loaderData} />;
}
