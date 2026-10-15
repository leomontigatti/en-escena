import type { AdminRouteHandle } from "@/components/admin/shell";
import { loadIndividualsList } from "@/features/admin/individuals/list/server";
import { IndividualsListRouteView } from "@/features/admin/individuals/list/view";

import type { Route } from "./+types/administracion.particulares";

type LoaderData = Awaited<ReturnType<typeof loader>>;

type IndividualsListRouteProps = {
  loaderData: LoaderData;
};

export const meta: Route.MetaFunction = () => [
  { title: "Particulares | Panel de administración | En Escena" },
];

export const handle = {
  adminBreadcrumbs: [{ label: "Particulares" }],
  adminShell: { showEventSelector: false },
} satisfies AdminRouteHandle;

export async function loader({ request }: Route.LoaderArgs) {
  return await loadIndividualsList(request);
}

export default function IndividualsListRoute({
  loaderData,
}: IndividualsListRouteProps) {
  return <IndividualsListRouteView loaderData={loaderData} />;
}
