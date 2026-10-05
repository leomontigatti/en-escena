import { loadDancersExport } from "@/features/admin/dancers/export/server";

import type { Route } from "./+types/administracion_.bailarines.exportar";

// A resource route: the auditor's dancers spreadsheet, downloaded from the
// dancers list's actions menu.
export async function loader({ request }: Route.LoaderArgs) {
  return await loadDancersExport(request);
}
