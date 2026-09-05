import type { AdminRouteHandle } from "@/components/admin/shell";
import { FilterPanelPrototypesView } from "@/features/prototypes/filter-panel/view";
import { requireInternalUser } from "@/lib/auth/internal-access.server";

import type { Route } from "./+types/administracion.prototipos-filtros";

export const meta = () => [
  { title: "Prototipos de filtros | Panel de administración | En Escena" },
];

export const handle = {
  adminBreadcrumbs: [{ label: "Prototipos de filtros" }],
} satisfies AdminRouteHandle;

export async function loader({ request }: Route.LoaderArgs) {
  await requireInternalUser(request, ["admin", "auditor"]);

  return null;
}

export default function FilterPanelPrototypesRoute() {
  return <FilterPanelPrototypesView />;
}
