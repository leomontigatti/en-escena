import { loadComprobantePrint } from "@/features/admin/comprobantes/print/server";

import type { Route } from "./+types/administracion.comprobantes_.$comprobanteId.imprimir";

// Vista imprimible on-demand del comprobante (#329/#334). Ruta de recurso: el
// loader devuelve el HTML autocontenido directamente, sin componente ni chrome
// de administración. No dispara ninguna emisión.
export async function loader({ request, params }: Route.LoaderArgs) {
  return await loadComprobantePrint(request, params.comprobanteId);
}
