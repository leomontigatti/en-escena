import { loadVoteCodeSheet } from "@/features/admin/grand-final/vote-codes/server";

import type { Route } from "./+types/administracion_.gran-final.codigos-qr.$batchId";

// A resource route: the printable sheet of one batch of `Gran final` QR
// codes, opened in a new tab from the list's batches, with no administration
// chrome. The browser prints it or saves it as a PDF.
export async function loader({ request, params }: Route.LoaderArgs) {
  return await loadVoteCodeSheet(request, params.batchId);
}
