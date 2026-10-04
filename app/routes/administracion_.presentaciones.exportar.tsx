import { loadProgramExport } from "@/features/admin/presentations/program-export/server";

import type { Route } from "./+types/administracion_.presentaciones.exportar";

// A resource route: the program as a spreadsheet, downloaded from the
// participation list's actions menu.
export async function loader({ request }: Route.LoaderArgs) {
  return await loadProgramExport(request);
}
