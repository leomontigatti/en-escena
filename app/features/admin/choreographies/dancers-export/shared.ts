import { choreographyDetailPath } from "@/lib/choreographies/admin-paths";

/** Where a choreography's dancers export lives, under its detail. */
export function choreographyDancersExportPath(choreographyId: string) {
  return `${choreographyDetailPath(choreographyId)}/bailarines/exportar`;
}
