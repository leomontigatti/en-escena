import { useActionData } from "react-router";

import type { AdminRouteHandle } from "@/components/admin/shell";
import {
  handleAcademyGrandFinalAction,
  loadAcademyGrandFinalRouteData,
} from "@/features/admin/grand-final/academy/server";
import type { AcademyGrandFinalLoaderData } from "@/features/admin/grand-final/academy/shared";
import { AcademyGrandFinalView } from "@/features/admin/grand-final/academy/view";
import { recoverableClientAction } from "@/lib/shared/recoverable-client-action";

import type { Route } from "./+types/administracion.gran-final_.$academyId.$modalityId";

export const meta = () => [
  { title: "Academia | Gran final | Panel de administración | En Escena" },
];

export const handle = {
  adminBreadcrumbs: [
    { label: "Gran final", to: "/administracion/gran-final" },
    (match) => {
      const data = match.data as AcademyGrandFinalLoaderData | undefined;

      return { label: data?.academyName ?? "Academia" };
    },
  ],
} satisfies AdminRouteHandle;

export async function loader({ params, request }: Route.LoaderArgs) {
  return await loadAcademyGrandFinalRouteData(request, params);
}

export async function action({ params, request }: Route.ActionArgs) {
  return await handleAcademyGrandFinalAction(request, params);
}

export async function clientAction({ serverAction }: Route.ClientActionArgs) {
  return await recoverableClientAction(serverAction);
}

export default function AcademyGrandFinalRoute({
  loaderData,
}: Route.ComponentProps) {
  const actionData = useActionData<typeof action>();

  return (
    <AcademyGrandFinalView
      actionData={actionData && "status" in actionData ? actionData : undefined}
      loaderData={loaderData}
    />
  );
}
