/** THROWAWAY PROTOTYPE — ticket #585's route. Delete with the prototype. */
import type { AdminRouteHandle } from "@/components/admin/shell";
import { DiscountProvenancePrototypeView } from "@/features/admin/finances/discount-provenance-prototype/view";
import { requireInternalUser } from "@/lib/auth/internal-access.server";

import type { Route } from "./+types/administracion.finanzas_.prototipo-descuentos";

export const meta: Route.MetaFunction = () => [
  {
    title:
      "Prototipo de descuentos · coreografía | Panel de administración | En Escena",
  },
];

export const handle = {
  adminBreadcrumbs: [
    { label: "Finanzas", to: "/administracion/finanzas" },
    { label: "Prototipo de descuentos" },
  ],
} satisfies AdminRouteHandle;

export async function loader({ request }: Route.LoaderArgs) {
  await requireInternalUser(request, ["admin", "auditor"]);
  return null;
}

export default function DiscountProvenancePrototypeRoute() {
  return <DiscountProvenancePrototypeView />;
}
