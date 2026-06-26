import type { AdminRouteHandle } from "@/components/admin/shell";
import { redirect } from "react-router";
import type { Route } from "./+types/administracion.coreografias";
import { loadAdminEventContext } from "@/lib/admin/event-context.server";
import { requireInternalUser } from "@/lib/auth/internal-access.server";
import {
  loadAdministrativeChoreographies,
  readAdministrativeChoreographyFilters,
} from "@/features/admin/choreographies/list/server";
import { AdministracionCoreografiasRouteView } from "@/features/admin/choreographies/list/view";

type LoaderData = Awaited<ReturnType<typeof loader>>;

type AdministracionCoreografiasRouteProps = {
  loaderData: LoaderData;
};

export const meta = () => [
  { title: "Coreografías | Panel de administración | En Escena" },
];

export const handle = {
  adminBreadcrumbs: [{ label: "Coreografías" }],
} satisfies AdminRouteHandle;

export async function loader({ request }: Route.LoaderArgs) {
  await requireInternalUser(request, ["admin", "auditor"]);
  const eventContext = await loadAdminEventContext(request);

  if (eventContext.redirectTo) {
    throw redirect(eventContext.redirectTo);
  }

  const filters = readAdministrativeChoreographyFilters(
    new URL(request.url).searchParams,
  );

  return await loadAdministrativeChoreographies({
    filters,
    selectedEventId: eventContext.selectedEventId,
  });
}

export { AdministracionCoreografiasRouteView };

export default function AdministracionCoreografiasRoute({
  loaderData,
}: AdministracionCoreografiasRouteProps) {
  return <AdministracionCoreografiasRouteView loaderData={loaderData} />;
}
