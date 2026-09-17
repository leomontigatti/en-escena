import { groupTypeLabels, type GroupType } from "@/lib/events/group-types";

export const choreographyNotFoundMessage = "No encontramos esa coreografía.";

/**
 * A single text for the experience-level rejection. It lives here and not in the
 * roster module because portal sign-up, roster saving and the detail's standalone
 * reassignment all share it, and the validator the three of them use cannot
 * import from the roster without inverting the dependency.
 */
export const invalidExperienceLevelMessage =
  "Elegí un nivel de experiencia válido para esta coreografía.";

/**
 * The registration rejection when the dancers' ages resolve to no category of
 * the modality. The academy can only fix it from the two inputs it chose, so
 * the sentence names both: the modality and the group type its roster derives.
 */
export function getNoCompatibleCategoryRegistrationMessage(input: {
  modalityName: string;
  groupType: GroupType;
}) {
  return `No hay una categoría de ${input.modalityName} para ${groupTypeLabels[input.groupType]} con las edades de estos bailarines. Revisá los bailarines o la modalidad.`;
}
