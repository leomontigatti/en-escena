/**
 * Where the administration reads choreographies. They are reached academy by
 * academy, so both addresses carry the academy: its list, and each detail under
 * it. A link that only knows the choreography cannot be built, which is the
 * point — every surface linking here already knows whose choreography it is.
 */

export const choreographyAcademiesPath = "/administracion/coreografias";

export function academyChoreographiesPath(academyId: string) {
  return `${choreographyAcademiesPath}/${academyId}`;
}

export function choreographyDetailPath(input: {
  academyId: string;
  choreographyId: string;
}) {
  return `${academyChoreographiesPath(input.academyId)}/${input.choreographyId}`;
}
