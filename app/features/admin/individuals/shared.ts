import type { IdentityDocumentType } from "@/lib/roster/identity-document";
import type { IndividualLinkState } from "@/lib/individuals/link-state";
import {
  buildCanonicalListSearch,
  type ListQuerySpec,
} from "@/lib/list-query/list-query";

/** `Particulares`, the admin section where administration confirms links. */
export const basePath = "/administracion/particulares";

export type IndividualListFilters = {
  page: number;
  query: string;
  /** `null` is every state. */
  linkState: IndividualLinkState | null;
};

export type IndividualListItem = {
  documentNumber: string;
  documentType: IdentityDocumentType;
  firstName: string;
  id: string;
  lastName: string;
  linkState: IndividualLinkState;
};

/**
 * The list has one order —by name— and no sortable column, so an `orden` in
 * its URL is only ever dropped.
 */
export const individualListSpec: ListQuerySpec<"nombre"> = {
  orderColumnIds: ["nombre"],
  defaultOrder: { columnId: "nombre", direction: "asc" },
};

/** The list's facets as the URL writes them, each absent at its default. */
export function toIndividualListFacets(filters: IndividualListFilters) {
  return { vinculo: filters.linkState };
}

/** What the list applied, as its canonical address is written from it. */
export function toIndividualAppliedListQuery(filters: IndividualListFilters) {
  return {
    facets: toIndividualListFacets(filters),
    query: {
      order: individualListSpec.defaultOrder,
      page: filters.page,
      search: filters.query,
    },
    spec: individualListSpec,
  };
}

/** The detail's address, carrying the list's query so `Volver` returns to it. */
export function buildIndividualDetailHref(
  filters: IndividualListFilters,
  individualId: string,
) {
  const search = buildCanonicalListSearch({
    ...toIndividualAppliedListQuery(filters),
    currentSearch: "",
  });

  return `${basePath}/${individualId}${search.length > 0 ? `?${search}` : ""}`;
}
