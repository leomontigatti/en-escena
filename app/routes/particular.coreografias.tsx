import { loadIndividualChoreographies } from "@/features/individual/choreographies/server";
import { IndividualChoreographiesView } from "@/features/individual/choreographies/view";
import type { IndividualRouteHandle } from "@/features/individual/shell/view";

import type { Route } from "./+types/particular.coreografias";

export const meta: Route.MetaFunction = () => [
  { title: "Coreografías | Particular | En Escena" },
];

export const handle = {
  individualBreadcrumb: "Coreografías",
} satisfies IndividualRouteHandle;

export async function loader({ request }: Route.LoaderArgs) {
  return await loadIndividualChoreographies(request);
}

export default function IndividualChoreographiesRoute({
  loaderData,
}: Route.ComponentProps) {
  return <IndividualChoreographiesView loaderData={loaderData} />;
}
