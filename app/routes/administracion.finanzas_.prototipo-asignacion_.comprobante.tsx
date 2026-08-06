/** THROWAWAY PROTOTYPE — ticket #585's route, view 3. Delete with the prototype. */
import type { AdminRouteHandle } from "@/components/admin/shell";
import { ComprobantePrototypeView } from "@/features/admin/finances/allocation-prototype/comprobante-view";
import { requireInternalUser } from "@/lib/auth/internal-access.server";

import type { Route } from "./+types/administracion.finanzas_.prototipo-asignacion_.comprobante";

export const meta: Route.MetaFunction = () => [
  {
    title:
      "Prototipo de asignación · comprobante | Panel de administración | En Escena",
  },
];

export const handle = {
  adminBreadcrumbs: [
    { label: "Finanzas", to: "/administracion/finanzas" },
    {
      label: "Prototipo de asignación",
      to: "/administracion/finanzas/prototipo-asignacion",
    },
    { label: "Comprobante" },
  ],
} satisfies AdminRouteHandle;

export async function loader({ request }: Route.LoaderArgs) {
  await requireInternalUser(request, ["admin", "auditor"]);
  return null;
}

export default function ComprobantePrototypeRoute() {
  return <ComprobantePrototypeView />;
}
