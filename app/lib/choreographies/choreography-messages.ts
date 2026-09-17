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
  modalityName: string | null;
  groupType: GroupType;
}) {
  // Both callers read the name from a list the modality is guaranteed to be
  // in, so the second wording is a fallback rather than a case: it keeps a
  // lookup that came back empty from rendering "una categoría de  para …".
  const subject = input.modalityName
    ? `una categoría de ${input.modalityName}`
    : "una categoría";

  return `No hay ${subject} para ${groupTypeLabels[input.groupType]} con las edades de estos bailarines. Revisá los bailarines o la modalidad.`;
}

/**
 * The roster rejection when the edited roster resolves to no category. Unlike
 * registration, the administrator did not choose a modality here — the only
 * lever is the roster — so the sentence names just that.
 */
export const noCompatibleCategoryRosterMessage =
  "Con este elenco no existe una categoría válida. Ajustá los bailarines para poder guardar.";

/**
 * The modality correction's rejection when the destination modality resolves no
 * category. The only lever the administrator has here is the select they just
 * used — the roster is not part of this correction — so the sentence points
 * back at it.
 */
export const noCompatibleCategoryModalityMessage =
  "Con esta modalidad no hay categoría compatible. Elegí otra modalidad.";
