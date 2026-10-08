import type { PortalRouteHandle } from "@/components/portal/ui";
import { loadPortalHome } from "@/features/portal/home/server";
import { PortalHomeRouteView } from "@/features/portal/home/view";

import type { Route } from "./+types/portal._index";

export const handle = {
  portalBreadcrumbs: [{ label: "Inicio" }],
} satisfies PortalRouteHandle;

export const meta: Route.MetaFunction = () => [
  { title: "Portal de academias | En Escena" },
];

export async function loader({ request }: Route.LoaderArgs) {
  return await loadPortalHome(request);
}

export default function PortalIndexRoute({ loaderData }: Route.ComponentProps) {
  return <PortalHomeRouteView loaderData={loaderData} />;
}
