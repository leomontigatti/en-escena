import type { AdminRouteHandle } from "@/components/admin/shell";
import { createDataTableShouldRevalidate } from "@/components/shared/data-table-revalidation";
import { loadAcademiesList } from "@/features/admin/academies/list/server";
import {
  AcademiesListRouteView,
  academyFacetedFilterIds,
} from "@/features/admin/academies/list/view";

import type { Route } from "./+types/administracion.academias";

type LoaderData = Awaited<ReturnType<typeof loader>>;

type AcademiesListRouteProps = {
  loaderData: LoaderData;
};

export const meta: Route.MetaFunction = () => [
  { title: "Academias | Panel de administración | En Escena" },
];

export const handle = {
  adminBreadcrumbs: [{ label: "Academias" }],
} satisfies AdminRouteHandle;

export async function loader({ request }: Route.LoaderArgs) {
  return await loadAcademiesList(request);
}

export const shouldRevalidate = createDataTableShouldRevalidate({
  filterParamNames: [...academyFacetedFilterIds],
});

export { AcademiesListRouteView };

export default function AcademiesListRoute({
  loaderData,
}: AcademiesListRouteProps) {
  return <AcademiesListRouteView loaderData={loaderData} />;
}
