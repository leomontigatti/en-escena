import { loadProfessorsExport } from "@/features/admin/professors/export/server";

import type { Route } from "./+types/administracion_.profesores.exportar";

// A resource route: the auditor's professors spreadsheet, downloaded from the
// professors list's actions menu.
export async function loader({ request }: Route.LoaderArgs) {
  return await loadProfessorsExport(request);
}
