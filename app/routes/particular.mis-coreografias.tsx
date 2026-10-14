import { loadIndividualChoreographies } from "@/features/individual/choreographies/server";
import { IndividualChoreographiesView } from "@/features/individual/choreographies/view";

import type { Route } from "./+types/particular.mis-coreografias";

export const meta: Route.MetaFunction = () => [
  { title: "Mis coreografías | Particular | En Escena" },
];

export async function loader({ request }: Route.LoaderArgs) {
  return await loadIndividualChoreographies(request);
}

export default function IndividualChoreographiesRoute({
  loaderData,
}: Route.ComponentProps) {
  return <IndividualChoreographiesView loaderData={loaderData} />;
}
