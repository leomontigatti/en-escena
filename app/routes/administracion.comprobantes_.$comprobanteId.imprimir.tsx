import { loadComprobantePrint } from "@/features/admin/comprobantes/print/server";

import type { Route } from "./+types/administracion.comprobantes_.$comprobanteId.imprimir";

// The comprobante's on-demand printable view (#329/#334). A resource route: the
// loader returns the self-contained HTML directly, with no component and no
// administration chrome. It triggers no emission.
export async function loader({ request, params }: Route.LoaderArgs) {
  return await loadComprobantePrint(request, params.comprobanteId);
}
