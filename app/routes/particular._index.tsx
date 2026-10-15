import { redirect } from "react-router";

import { individualProfilePath } from "@/features/individual/shell/view";

// The area opens on `Perfil`, where a new individual starts its link. The
// layout's loader has already admitted the individual.
export function loader() {
  throw redirect(individualProfilePath);
}
