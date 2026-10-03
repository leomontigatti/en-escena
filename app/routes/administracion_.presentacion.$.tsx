import { redirectLegacyPresentationsPath } from "@/features/admin/presentations/legacy-path";

import type { Route } from "./+types/administracion_.presentacion.$";

// The old singular path, and everything under it, kept alive for saved links.
export function loader({ request }: Route.LoaderArgs) {
  return redirectLegacyPresentationsPath(request);
}
