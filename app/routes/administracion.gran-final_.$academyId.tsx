import { useActionData } from "react-router";

import type { AdminRouteHandle } from "@/components/admin/shell";
import {
  handleFinalistBannersAction,
  loadFinalistBannersRouteData,
} from "@/features/admin/grand-final/banners/server";
import type { FinalistBannersLoaderData } from "@/features/admin/grand-final/banners/shared";
import { FinalistBannersView } from "@/features/admin/grand-final/banners/view";
import { recoverableClientAction } from "@/lib/shared/recoverable-client-action";

import type { Route } from "./+types/administracion.gran-final_.$academyId";

export const meta = () => [
  { title: "Banners | Gran final | Panel de administración | En Escena" },
];

export const handle = {
  adminBreadcrumbs: [
    { label: "Gran final", to: "/administracion/gran-final" },
    (match) => {
      const data = match.data as FinalistBannersLoaderData | undefined;

      return { label: data?.academyName ?? "Banners" };
    },
  ],
} satisfies AdminRouteHandle;

export async function loader({ params, request }: Route.LoaderArgs) {
  return await loadFinalistBannersRouteData(request, params.academyId ?? "");
}

export async function action({ params, request }: Route.ActionArgs) {
  return await handleFinalistBannersAction(request, params.academyId ?? "");
}

export async function clientAction({ serverAction }: Route.ClientActionArgs) {
  return await recoverableClientAction(serverAction);
}

export default function FinalistBannersRoute({
  loaderData,
}: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();

  return (
    <FinalistBannersView
      actionData={actionData && "status" in actionData ? actionData : undefined}
      loaderData={loaderData}
    />
  );
}
