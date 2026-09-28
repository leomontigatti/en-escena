import type { PortalRouteHandle } from "@/components/portal/ui";
import { CreateChoreographyPage } from "@/features/portal/choreographies/create/page";
import {
  handleCreateChoreographyAction,
  loadCreateChoreographyRouteData,
} from "@/features/portal/choreographies/create/server";
import { recoverableClientAction } from "@/lib/shared/recoverable-client-action";

import type { Route } from "./+types/portal.coreografias_.crear";

export const meta = () => [
  { title: "Nueva coreografía | Portal de academias | En Escena" },
];

export const handle = {
  portalBreadcrumbs: [
    { label: "Coreografías", to: "/portal/coreografias" },
    { label: "Nueva" },
  ],
} satisfies PortalRouteHandle;

export async function loader({ request }: { request: Request }) {
  return await loadCreateChoreographyRouteData(request);
}

export async function action({ request }: { request: Request }) {
  return await handleCreateChoreographyAction(request);
}

export async function clientAction({ serverAction }: Route.ClientActionArgs) {
  return await recoverableClientAction(serverAction);
}

export default function PortalCoreografiasCreateRoute({
  loaderData,
}: Route.ComponentProps) {
  return <CreateChoreographyPage loaderData={loaderData} />;
}
