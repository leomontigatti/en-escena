import { useActionData } from "react-router";

import {
  handlePortalDancerDetailAction,
  loadPortalDancerDetail,
} from "@/features/portal/dancers/detail/server";
import {
  PortalDancerDetailRouteView,
  type PortalDancerDetailRouteViewProps,
} from "@/features/portal/dancers/detail/view";
import type { PortalRouteHandle } from "@/components/portal/ui";
import { recoverableClientAction } from "@/lib/shared/recoverable-client-action";

import type { Route } from "./+types/portal.bailarines_.$dancerId";

type LoaderData = PortalDancerDetailRouteViewProps["loaderData"];

type PortalDancerDetailRouteProps = {
  loaderData: LoaderData;
};

export const meta = () => [
  { title: "Editar bailarín | Portal de academias | En Escena" },
];

export const handle = {
  portalBreadcrumbs: [
    { label: "Bailarines", to: "/portal/bailarines" },
    (match) => {
      const data = match.data as LoaderData | undefined;
      const dancer = data?.dancer;

      return dancer
        ? { label: `${dancer.firstName} ${dancer.lastName}` }
        : null;
    },
  ],
} satisfies PortalRouteHandle;

export async function loader({
  request,
  params,
}: {
  request: Request;
  params: { dancerId?: string };
}) {
  return await loadPortalDancerDetail({ request, params });
}

export async function action({
  request,
  params,
}: {
  request: Request;
  params: { dancerId?: string };
}) {
  return await handlePortalDancerDetailAction({ request, params });
}

export async function clientAction({ serverAction }: Route.ClientActionArgs) {
  return await recoverableClientAction(serverAction);
}

export default function PortalBailarinDetalleRoute({
  loaderData,
}: PortalDancerDetailRouteProps) {
  const actionData = useActionData<typeof action>();

  return (
    <PortalDancerDetailRouteView
      loaderData={loaderData}
      actionData={actionData}
    />
  );
}
