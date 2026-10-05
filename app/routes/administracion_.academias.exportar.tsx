import { loadAcademiesExport } from "@/features/admin/academies/export/server";

import type { Route } from "./+types/administracion_.academias.exportar";

// A resource route: the auditor's academies spreadsheet, downloaded from the
// academies list's actions menu.
export async function loader({ request }: Route.LoaderArgs) {
  return await loadAcademiesExport(request);
}
