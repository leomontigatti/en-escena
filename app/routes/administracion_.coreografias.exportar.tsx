import { loadParticipationCountsExport } from "@/features/admin/choreographies/export/server";

import type { Route } from "./+types/administracion_.coreografias.exportar";

// A resource route: the auditor's participation counts, by province and by
// modality, downloaded from the choreographies list's actions menu.
export async function loader({ request }: Route.LoaderArgs) {
  return await loadParticipationCountsExport(request);
}
