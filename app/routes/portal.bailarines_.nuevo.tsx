import type { ShouldRevalidateFunction } from "react-router";

import type { PortalRouteHandle } from "@/components/portal/ui";
import { CreateDancerPage } from "@/features/portal/dancers/create/page";
import {
  handlePortalDancerCreateAction,
  loadPortalDancerCreate,
} from "@/features/portal/dancers/create/server";
import { recoverableClientAction } from "@/lib/shared/recoverable-client-action";

import type { Route } from "./+types/portal.bailarines_.nuevo";

export const meta = () => [
  { title: "Nuevo bailarín | Portal de academias | En Escena" },
];

export const handle = {
  portalBreadcrumbs: [
    { label: "Bailarines", to: "/portal/bailarines" },
    { label: "Nuevo bailarín" },
  ],
} satisfies PortalRouteHandle;

export async function loader({ request }: { request: Request }) {
  return await loadPortalDancerCreate(request);
}

export async function action({ request }: { request: Request }) {
  return await handlePortalDancerCreateAction(request);
}

// A refusal comes back as data and changes nothing the loader reads, and a
// save leaves the page.
export const shouldRevalidate: ShouldRevalidateFunction = ({
  defaultShouldRevalidate,
  formMethod,
}) => (formMethod ? false : defaultShouldRevalidate);

export async function clientAction({ serverAction }: Route.ClientActionArgs) {
  return await recoverableClientAction(serverAction);
}

export default function PortalBailarinesCreateRoute({
  actionData,
  loaderData,
}: Route.ComponentProps) {
  return (
    <CreateDancerPage
      actionData={actionData}
      eventStartDate={loaderData.activeEventStartDate}
    />
  );
}
