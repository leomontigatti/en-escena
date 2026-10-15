import { loadIndividualShell } from "@/features/individual/shell/server";
import {
  IndividualShellErrorBoundary,
  IndividualShellRouteView,
} from "@/features/individual/shell/view";

import type { Route } from "./+types/particular";

export const meta: Route.MetaFunction = () => [
  { title: "Particular | En Escena" },
];

export async function loader({ request }: Route.LoaderArgs) {
  return await loadIndividualShell(request);
}

export const ErrorBoundary = IndividualShellErrorBoundary;

export default IndividualShellRouteView;
