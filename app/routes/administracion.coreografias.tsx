import type { AdminRouteHandle } from "@/components/admin/shell";
import { createDataTableShouldRevalidate } from "@/components/shared/data-table-revalidation";
import { loadChoreographyAcademies } from "@/features/admin/choreographies/academies/server";
import { ChoreographyAcademiesRouteView } from "@/features/admin/choreographies/academies/view";

import type { Route } from "./+types/administracion.coreografias";

type LoaderData = Awaited<ReturnType<typeof loader>>;

type ChoreographyAcademiesRouteProps = {
  loaderData: LoaderData;
};

export const meta: Route.MetaFunction = () => [
  { title: "Coreografías | Panel de administración | En Escena" },
];

export const handle = {
  adminBreadcrumbs: [{ label: "Coreografías" }],
} satisfies AdminRouteHandle;

export async function loader({ request }: Route.LoaderArgs) {
  return await loadChoreographyAcademies(request);
}

export const shouldRevalidate = createDataTableShouldRevalidate();

export default function ChoreographyAcademiesRoute({
  loaderData,
}: ChoreographyAcademiesRouteProps) {
  return <ChoreographyAcademiesRouteView loaderData={loaderData} />;
}
