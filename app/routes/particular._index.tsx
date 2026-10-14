import { redirect } from "react-router";

import { individualPersonalDataPath } from "@/features/individual/shell/view";

// `Mis datos` is the area's only screen for now, so the area opens on it. The
// layout's loader has already admitted the individual.
export function loader() {
  throw redirect(individualPersonalDataPath);
}
