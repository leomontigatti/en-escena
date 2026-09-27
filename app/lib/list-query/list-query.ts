/**
 * The list query (`listQuery`, "Consulta de lista" to the reader): what a
 * reader expresses through a list's URL — its search, its order and its page —
 * and how it is read from the address bar and written back. Every list reads
 * these three through here, so the same gesture means the same thing on every
 * screen. What a list offers as a facet stays with the module that owns the
 * concept; this owns only the mechanics.
 *
 * Surface-neutral on purpose: nothing here knows which screen asked, so the
 * portal lists can adopt it as they are.
 */

export const listQueryParamNames = {
  order: "orden",
  page: "pagina",
  search: "busqueda",
} as const;

export type ListOrderDirection = "asc" | "desc";

export type ListOrder<TColumnId extends string = string> = {
  columnId: TColumnId;
  direction: ListOrderDirection;
};

/** What a list declares about itself for its query to be read. */
export type ListQuerySpec<TColumnId extends string> = {
  orderColumnIds: readonly TColumnId[];
  defaultOrder: ListOrder<TColumnId>;
  /**
   * Parameters the list's canonical URL keeps verbatim although they are not
   * part of its query. No list has one today: a list route carries nothing but
   * its query, and flash messages travel in the session, not the URL. It is
   * here so that the day a list route grows one, a save does not silently drop
   * it on the redirect.
   */
  preservedParamNames?: readonly string[];
};

export type ListQuery<TColumnId extends string> = {
  order: ListOrder<TColumnId>;
  page: number;
  search: string;
};

export function readListQuery<TColumnId extends string>(
  searchParams: URLSearchParams,
  spec: ListQuerySpec<TColumnId>,
): ListQuery<TColumnId> {
  return {
    order: readListOrder(searchParams, spec),
    page: readListPage(searchParams),
    search: readListSearch(searchParams),
  };
}

/** Surrounding spaces are not part of a search, and an empty one is none. */
function readListSearch(searchParams: URLSearchParams) {
  return searchParams.get(listQueryParamNames.search)?.trim() ?? "";
}

/**
 * An order is one list's column and a direction. A token naming a column the
 * list does not sort by — a hand-edited or stale URL — is its default order.
 */
function readListOrder<TColumnId extends string>(
  searchParams: URLSearchParams,
  spec: ListQuerySpec<TColumnId>,
): ListOrder<TColumnId> {
  const order = parseListOrder(searchParams.get(listQueryParamNames.order));
  const columnId = spec.orderColumnIds.find(
    (orderColumnId) => orderColumnId === order?.columnId,
  );

  return order !== null && columnId !== undefined
    ? { columnId, direction: order.direction }
    : spec.defaultOrder;
}

/**
 * The order token, `columnId:direction`, split without knowing which columns a
 * list sorts by. Split on the last colon, so a column id is free to hold one.
 */
export function parseListOrder(token: string | null): ListOrder | null {
  if (!token) {
    return null;
  }

  const separatorIndex = token.lastIndexOf(":");
  const columnId = token.slice(0, separatorIndex);
  const direction = token.slice(separatorIndex + 1);

  if (separatorIndex <= 0 || (direction !== "asc" && direction !== "desc")) {
    return null;
  }

  return { columnId, direction };
}

export function formatListOrder(order: ListOrder) {
  return `${order.columnId}:${order.direction}`;
}

/**
 * A facet's value as the URL carries it, trimmed, or `null` when it carries
 * none. Which values a facet accepts is the owning list's to check.
 */
export function readListFacet(
  searchParams: URLSearchParams,
  paramName: string,
) {
  const value = searchParams.get(paramName)?.trim() ?? "";

  return value.length > 0 ? value : null;
}

/** A page is a whole number from one up; anything else is the first page. */
export function readListPage(searchParams: URLSearchParams) {
  const page = Number(searchParams.get(listQueryParamNames.page));

  return Number.isInteger(page) && page >= 1 ? page : 1;
}

/**
 * Which slice of a list a page is. A page past the last one is the last one,
 * so the reader lands on rows rather than on nothing; the page size is the
 * surface's policy and comes from the caller.
 */
export function paginateList(input: {
  page: number;
  pageSize: number;
  totalCount: number;
}) {
  const totalPages = Math.max(1, Math.ceil(input.totalCount / input.pageSize));
  const page = Math.min(input.page, totalPages);

  return {
    limit: input.pageSize,
    offset: (page - 1) * input.pageSize,
    page,
    totalPages,
  };
}

/** What a list applied, as its canonical address is written from it. */
export type AppliedListQuery<TColumnId extends string> = {
  /** The list's facets, by parameter name, in the order the URL shows them. */
  facets: Record<string, string | null>;
  query: ListQuery<TColumnId>;
  spec: ListQuerySpec<TColumnId>;
};

/**
 * The address a list's applied query lives at. It is written from what the
 * list applied rather than from what was asked, in one fixed order, with every
 * default left out, so one list state has one URL: a clamped page, a dropped
 * filter value or a stale parameter from a retired feature all come out
 * corrected. Anything the list does not declare is dropped.
 *
 * Idempotent by construction — its own output reads back to the same query and
 * writes the same string — which is what keeps the redirect from looping.
 */
export function buildCanonicalListSearch<TColumnId extends string>(
  input: AppliedListQuery<TColumnId> & { currentSearch: string },
) {
  const { query, spec } = input;
  const currentParams = new URLSearchParams(input.currentSearch);
  const canonicalParams = new URLSearchParams();

  if (query.search.length > 0) {
    canonicalParams.set(listQueryParamNames.search, query.search);
  }

  for (const [paramName, value] of Object.entries(input.facets)) {
    if (value !== null && value.length > 0) {
      canonicalParams.set(paramName, value);
    }
  }

  if (!isSameListOrder(query.order, spec.defaultOrder)) {
    canonicalParams.set(
      listQueryParamNames.order,
      formatListOrder(query.order),
    );
  }

  if (query.page > 1) {
    canonicalParams.set(listQueryParamNames.page, String(query.page));
  }

  for (const paramName of spec.preservedParamNames ?? []) {
    for (const value of currentParams.getAll(paramName)) {
      canonicalParams.append(paramName, value);
    }
  }

  return canonicalParams.toString();
}

function isSameListOrder(firstOrder: ListOrder, secondOrder: ListOrder) {
  return (
    firstOrder.columnId === secondOrder.columnId &&
    firstOrder.direction === secondOrder.direction
  );
}

/**
 * The search rule: accent- and case-insensitive, so typing `bailarin` finds
 * `Bailarín`. This is the reference definition; `listSearchCondition` is its
 * SQL twin, and a list that searches in memory and one that searches in SQL
 * must agree on every input.
 */
export function foldSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("es-AR")
    .trim();
}

/** Whether any of a row's searchable values holds the search, folded. */
export function matchesListSearch(search: string, values: readonly string[]) {
  const foldedSearch = foldSearchText(search);

  return (
    foldedSearch.length === 0 ||
    values.some((value) => foldSearchText(value).includes(foldedSearch))
  );
}

/** A search is matched literally: `%` and `_` in a name are not wildcards. */
export function escapeLikePattern(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");
}

/**
 * What an empty list says, in one wording on every list: nothing exists yet, or
 * something exists and the search or the filters matched none of it. The
 * resource is the lowercase plural the glossary gives the reader.
 */
export function describeEmptyList(resourceName: string) {
  return {
    nothingMatched: `No hay ${resourceName} que coincidan con la búsqueda o los filtros.`,
    nothingYet: `Todavía no hay ${resourceName}.`,
  };
}
