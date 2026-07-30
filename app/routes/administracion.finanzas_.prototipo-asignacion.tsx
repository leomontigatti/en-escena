/** PROTOTIPO DESCARTABLE — ruta del ticket #550. Borrar junto con el prototipo. */
import type { AdminRouteHandle } from "@/components/admin/shell";
import { AllocationPrototypeRouteView } from "@/features/admin/finances/allocation-prototype/view";
import { requireInternalUser } from "@/lib/auth/internal-access.server";

import type { Route } from "./+types/administracion.finanzas_.prototipo-asignacion";

export const meta: Route.MetaFunction = () => [
  {
    title: "Prototipo de asignación | Panel de administración | En Escena",
  },
];

export const handle = {
  adminBreadcrumbs: [
    { label: "Finanzas", to: "/administracion/finanzas" },
    { label: "Prototipo de asignación" },
  ],
} satisfies AdminRouteHandle;

export async function loader({ request }: Route.LoaderArgs) {
  await requireInternalUser(request, ["admin", "auditor"]);
  return null;
}

export default function AllocationPrototypeRoute() {
  return <AllocationPrototypeRouteView />;
}
