import { createDataTableShouldRevalidate } from "@/components/shared/data-table-revalidation";
import { loadIndividualFinances } from "@/features/individual/finances/server";
import { IndividualFinancesView } from "@/features/individual/finances/view";
import type { IndividualRouteHandle } from "@/features/individual/shell/view";

import type { Route } from "./+types/particular.finanzas";

export const meta: Route.MetaFunction = () => [
  { title: "Finanzas de seminarios | Particular | En Escena" },
];

export const handle = {
  individualBreadcrumb: "Finanzas de seminarios",
} satisfies IndividualRouteHandle;

export async function loader({ request }: Route.LoaderArgs) {
  return await loadIndividualFinances(request);
}

export const shouldRevalidate = createDataTableShouldRevalidate();

export default function IndividualFinancesRoute({
  loaderData,
}: Route.ComponentProps) {
  return <IndividualFinancesView loaderData={loaderData} />;
}
