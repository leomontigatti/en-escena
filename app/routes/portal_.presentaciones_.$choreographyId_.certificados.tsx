import { loadPortalCertificates } from "@/features/portal/presentations/certificates/server";

import type { Route } from "./+types/portal_.presentaciones_.$choreographyId_.certificados";

// A resource route: the certificates PDF, opened in a new tab from the
// evaluation detail's `Acciones` menu, with no portal chrome.
export async function loader({ request, params }: Route.LoaderArgs) {
  return await loadPortalCertificates({ params, request });
}
