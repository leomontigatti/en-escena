/**
 * PROTOTIPO #339 (throwaway) — ruta de la lista global de comprobantes.
 * Navegable desde el navbar, debajo de "Pagos". Sin loader real: datos stub.
 */

import type { AdminRouteHandle } from "@/components/admin/shell";
import { ComprobantesListPrototype } from "@/features/admin/_prototype-339/list-variants";

export const meta = () => [
  { title: "Comprobantes | Panel de administración | En Escena" },
];

export const handle = {
  adminBreadcrumbs: [{ label: "Comprobantes" }],
} satisfies AdminRouteHandle;

export default function AdministracionComprobantesRoute() {
  return <ComprobantesListPrototype />;
}
