import { loadChoreographyDancersExport } from "@/features/admin/choreographies/dancers-export/server";

import type { Route } from "./+types/administracion_.coreografias_.$choreographyId_.bailarines.exportar";

// A resource route: the choreography's dancers as a spreadsheet, downloaded
// from its detail's actions menu.
export async function loader({ params, request }: Route.LoaderArgs) {
  return await loadChoreographyDancersExport({ params, request });
}
