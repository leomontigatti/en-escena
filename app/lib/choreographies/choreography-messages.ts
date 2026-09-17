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

/**
 * The roster rejection when the edited roster resolves to no category. Unlike
 * registration, the administrator did not choose a modality here — the only
 * lever is the roster — so the sentence names just that.
 */
export const noCompatibleCategoryRosterMessage =
  "Con este elenco no existe una categoría válida. Ajustá los bailarines para poder guardar.";
