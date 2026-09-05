import type { AdminRouteHandle } from "@/components/admin/shell";
import { createDataTableShouldRevalidate } from "@/components/shared/data-table-revalidation";
import {
  handleChoreographyFinanceAction,
  loadChoreographyFinanceDetail,
} from "@/features/admin/finances/academy-choreographies/choreography-detail/server";
import { ChoreographyFinanceDetailView } from "@/features/admin/finances/academy-choreographies/choreography-detail/view";

import type { Route } from "./+types/administracion.finanzas_.$academyId_.coreografias_.$choreographyId";

type LoaderData = Awaited<ReturnType<typeof loader>>;

type ChoreographyFinanceDetailRouteProps = {
  loaderData: LoaderData;
};

export const meta: Route.MetaFunction = () => [
  { title: "Detalle financiero | Panel de administración | En Escena" },
];

export const handle = {
  adminBreadcrumbs: [
    { label: "Finanzas", to: "/administracion/finanzas" },
    (match) => {
      const data = match.data as LoaderData | undefined;
      return data?.academy
        ? {
            label: data.academy.name,
            to: `/administracion/finanzas/${data.academy.id}`,
          }
        : null;
    },
    (match) => {
      const data = match.data as LoaderData | undefined;
      return data?.choreography ? { label: data.choreography.name } : null;
    },
  ],
} satisfies AdminRouteHandle;

export async function loader({ request, params }: Route.LoaderArgs) {
  return await loadChoreographyFinanceDetail({
    request,
    params,
  });
}

export async function action({ request, params }: Route.ActionArgs) {
  return await handleChoreographyFinanceAction({
    request,
    params,
  });
}

export const shouldRevalidate = createDataTableShouldRevalidate();

function ChoreographyFinanceDetailRouteView({
  loaderData,
}: ChoreographyFinanceDetailRouteProps) {
  return <ChoreographyFinanceDetailView loaderData={loaderData} />;
}

export default function ChoreographyFinanceDetailRoute({
  loaderData,
}: ChoreographyFinanceDetailRouteProps) {
  return <ChoreographyFinanceDetailRouteView loaderData={loaderData} />;
}
