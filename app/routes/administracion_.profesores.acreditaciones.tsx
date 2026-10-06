import { loadProfessorAccreditationsPrint } from "@/features/admin/professors/accreditations/server";

import type { Route } from "./+types/administracion_.profesores.acreditaciones";

// A resource route: the printable sheet of professor accreditations, opened in
// a new tab from the professors list's actions menu, with no administration
// chrome.
export async function loader({ request }: Route.LoaderArgs) {
  return await loadProfessorAccreditationsPrint(request);
}
