import { loadIndividualCertificate } from "@/features/individual/choreographies/certificate/server";

import type { Route } from "./+types/particular_.coreografias_.$choreographyId_.certificado";

// A resource route: the individual's certificate PDF, opened in a new tab from
// `Coreografías`, with no area chrome.
export async function loader({ request, params }: Route.LoaderArgs) {
  return await loadIndividualCertificate({ params, request });
}
