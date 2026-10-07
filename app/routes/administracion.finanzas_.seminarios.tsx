import type { AdminRouteHandle } from "@/components/admin/shell";
import { createDataTableShouldRevalidate } from "@/components/shared/data-table-revalidation";
import {
  handleSeminarInscriptionFinancesAction,
  loadSeminarInscriptionFinances,
} from "@/features/admin/finances/seminar-inscriptions/server";
import {
  SeminarInscriptionFinancesView,
  seminarInscriptionFinanceFacetedFilterIds,
} from "@/features/admin/finances/seminar-inscriptions/view";
import { recoverableClientAction } from "@/lib/shared/recoverable-client-action";

import type { Route } from "./+types/administracion.finanzas_.seminarios";

type LoaderData = Awaited<ReturnType<typeof loader>>;

export const meta: Route.MetaFunction = () => [
  { title: "Seminarios | Finanzas | Panel de administración | En Escena" },
];

export const handle = {
  adminBreadcrumbs: [
    { label: "Finanzas", to: "/administracion/finanzas" },
    { label: "Seminarios" },
  ],
} satisfies AdminRouteHandle;

export async function loader({ request }: Route.LoaderArgs) {
  return await loadSeminarInscriptionFinances(request);
}

export async function action({ request }: Route.ActionArgs) {
  return await handleSeminarInscriptionFinancesAction(request);
}

export async function clientAction({ serverAction }: Route.ClientActionArgs) {
  return await recoverableClientAction(serverAction);
}

export const shouldRevalidate = createDataTableShouldRevalidate({
  filterParamNames: [...seminarInscriptionFinanceFacetedFilterIds],
});

export default function SeminarInscriptionFinancesRoute({
  loaderData,
}: {
  loaderData: LoaderData;
}) {
  return <SeminarInscriptionFinancesView loaderData={loaderData} />;
}
