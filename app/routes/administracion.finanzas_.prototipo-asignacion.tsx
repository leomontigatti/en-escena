/** THROWAWAY PROTOTYPE — ticket #550's route. Delete along with the prototype. */
import type { AdminRouteHandle } from "@/components/admin/shell";
import { AllocationListPrototypeView } from "@/features/admin/finances/allocation-prototype/list-view";
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
  return <AllocationListPrototypeView />;
}
