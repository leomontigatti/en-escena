import { loadSeminarsExport } from "@/features/admin/seminars/export/server";

import type { Route } from "./+types/administracion_.seminarios.exportar";

// A resource route: the auditor's seminar inscriptions and their money, one
// sheet per seminar, downloaded from the seminar list's actions menu.
export async function loader({ request }: Route.LoaderArgs) {
  return await loadSeminarsExport(request);
}
