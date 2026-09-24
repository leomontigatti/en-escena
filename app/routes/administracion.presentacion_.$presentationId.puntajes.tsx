import type { AdminRouteHandle } from "@/components/admin/shell";
import {
  handlePresentationScoresAction,
  loadPresentationScoresRouteData,
  type PresentationScoresLoaderData,
} from "@/features/admin/presentations/scores/server";
import { PresentationScoresView } from "@/features/admin/presentations/scores/view";
import { recoverableClientAction } from "@/lib/shared/recoverable-client-action";
import { useServerActionToast } from "@/lib/shared/toasts";

import type { Route } from "./+types/administracion.presentacion_.$presentationId.puntajes";

export const meta = () => [
  { title: "Puntajes | Panel de administración | En Escena" },
];

export const handle = {
  adminBreadcrumbs: [
    { label: "Presentación", to: "/administracion/presentacion" },
    (match) => {
      const data = match.data as PresentationScoresLoaderData | undefined;

      return { label: data?.presentation.name ?? "Puntajes" };
    },
  ],
} satisfies AdminRouteHandle;

export async function loader({ params, request }: Route.LoaderArgs) {
  return await loadPresentationScoresRouteData({ params, request });
}

export async function action({ params, request }: Route.ActionArgs) {
  return await handlePresentationScoresAction({ params, request });
}

export async function clientAction({ serverAction }: Route.ClientActionArgs) {
  return await recoverableClientAction(serverAction);
}

export default function PresentationScoresRoute({
  actionData,
  loaderData,
}: Route.ComponentProps) {
  const result = actionData && "message" in actionData ? actionData : undefined;

  useServerActionToast(result);

  return <PresentationScoresView actionData={result} loaderData={loaderData} />;
}
