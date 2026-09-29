import type { AdminRouteHandle } from "@/components/admin/shell";
import { loadChoreographyListRouteData } from "@/features/admin/choreographies/list/server";
import { ChoreographiesListRouteView } from "@/features/admin/choreographies/list/view";
import { choreographyAcademiesPath } from "@/lib/choreographies/admin-paths";

import type { Route } from "./+types/administracion.coreografias_.$academyId";

type LoaderData = Awaited<ReturnType<typeof loader>>;

type ChoreographiesListRouteProps = {
  loaderData: LoaderData;
};

export const meta: Route.MetaFunction = () => [
  { title: "Coreografías | Panel de administración | En Escena" },
];

export const handle = {
  adminBreadcrumbs: [
    { label: "Coreografías", to: choreographyAcademiesPath },
    (match) => {
      const data = match.data as LoaderData | undefined;
      return data?.academy ? { label: data.academy.name } : null;
    },
  ],
} satisfies AdminRouteHandle;

export async function loader({ request, params }: Route.LoaderArgs) {
  return await loadChoreographyListRouteData({ request, params });
}

export { ChoreographiesListRouteView };

export default function ChoreographiesListRoute({
  loaderData,
}: ChoreographiesListRouteProps) {
  return <ChoreographiesListRouteView loaderData={loaderData} />;
}
