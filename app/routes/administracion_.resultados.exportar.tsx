import { loadResultsExport } from "@/features/admin/results/export/server";

import type { Route } from "./+types/administracion_.resultados.exportar";

// A resource route: the results as a spreadsheet, downloaded from the
// results list's actions menu.
export async function loader({ request }: Route.LoaderArgs) {
  return await loadResultsExport(request);
}
