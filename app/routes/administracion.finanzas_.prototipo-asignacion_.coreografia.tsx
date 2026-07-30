/** THROWAWAY PROTOTYPE — ticket #550's route, view 2. Delete with the prototype. */
import type { AdminRouteHandle } from "@/components/admin/shell";
import { AllocationDetailPrototypeView } from "@/features/admin/finances/allocation-prototype/detail-view";
import { requireInternalUser } from "@/lib/auth/internal-access.server";

import type { Route } from "./+types/administracion.finanzas_.prototipo-asignacion_.coreografia";

export const meta: Route.MetaFunction = () => [
  {
    title:
      "Prototipo de asignación · coreografía | Panel de administración | En Escena",
  },
];

export const handle = {
  adminBreadcrumbs: [
    { label: "Finanzas", to: "/administracion/finanzas" },
    {
      label: "Prototipo de asignación",
      to: "/administracion/finanzas/prototipo-asignacion",
    },
    { label: "Coreografía" },
  ],
} satisfies AdminRouteHandle;

export async function loader({ request }: Route.LoaderArgs) {
  await requireInternalUser(request, ["admin", "auditor"]);
  return null;
}

export default function AllocationDetailPrototypeRoute() {
  return <AllocationDetailPrototypeView />;
}
