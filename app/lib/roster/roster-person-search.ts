import { matchesListSearch } from "@/lib/list-query/list-query";
import { toDocumentNumberSearchTerm } from "@/lib/roster/identity-document";

type SearchableRosterPerson = {
  firstName: string;
  lastName: string;
  documentNumber: string | null;
};

/**
 * What a roster person is found by: either name, the full name in either order,
 * or the document typed with or without its separators. The reference
 * definition; `rosterPersonSearchCondition` is its SQL twin.
 */
export function matchesRosterPersonSearch(
  person: SearchableRosterPerson,
  search: string,
) {
  const documentNumber = person.documentNumber ?? "";
  const documentSearch = toDocumentNumberSearchTerm(search);

  return (
    matchesListSearch(search, [
      person.firstName,
      person.lastName,
      `${person.firstName} ${person.lastName}`,
      `${person.lastName} ${person.firstName}`,
      documentNumber,
    ]) ||
    (documentSearch !== null &&
      matchesListSearch(documentSearch, [documentNumber]))
  );
}
