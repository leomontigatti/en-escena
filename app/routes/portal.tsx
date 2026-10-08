import { loadPortalShell } from "@/features/portal/shell/server";
import {
  PortalShellErrorBoundary,
  PortalShellRouteView,
} from "@/features/portal/shell/view";

import type { Route } from "./+types/portal";

export const meta: Route.MetaFunction = () => [
  { title: "Portal de academias | En Escena" },
];

export async function loader({ request }: Route.LoaderArgs) {
  return await loadPortalShell(request);
}

export const ErrorBoundary = PortalShellErrorBoundary;

export default PortalShellRouteView;
