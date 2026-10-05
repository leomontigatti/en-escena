import { loadCollectionExport } from "@/features/admin/payments/export/server";

import type { Route } from "./+types/administracion_.pagos.exportar";

// A resource route: the auditor's `Recaudación` workbook, downloaded from the
// payments list's actions menu.
export async function loader({ request }: Route.LoaderArgs) {
  return await loadCollectionExport(request);
}
