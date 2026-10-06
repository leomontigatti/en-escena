/** Where the professors list sends its `Imprimir acreditaciones` action. */
const professorAccreditationsPath = "/administracion/profesores/acreditaciones";

/** The search parameter that carries each ticked professor's id. */
export const professorAccreditationIdParam = "profesor";

/**
 * The print page's address for what the list has on screen: the ticked rows
 * when there are any, and otherwise the list's own search and filters, which
 * the print page reads as "every professor they match", past the page shown.
 */
export function buildProfessorAccreditationsHref({
  professorIds,
  listSearch,
}: {
  professorIds: readonly string[];
  listSearch: string;
}) {
  const search =
    professorIds.length > 0
      ? new URLSearchParams(
          professorIds.map((id) => [professorAccreditationIdParam, id]),
        ).toString()
      : listSearch;

  return search.length > 0
    ? `${professorAccreditationsPath}?${search}`
    : professorAccreditationsPath;
}
