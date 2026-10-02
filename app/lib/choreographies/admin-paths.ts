/** Where the administration reads choreographies: one list, and each detail under it. */

export const choreographiesPath = "/administracion/coreografias";

export function choreographyDetailPath(choreographyId: string) {
  return `${choreographiesPath}/${choreographyId}`;
}
