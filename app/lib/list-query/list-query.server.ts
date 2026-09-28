import { or, sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { redirect } from "react-router";

import {
  buildCanonicalListSearch,
  type AppliedListQuery,
  escapeLikePattern,
  foldSearchText,
} from "@/lib/list-query/list-query";

/**
 * The accented letters the SQL fold knows, and what each folds to. It is the
 * Spanish set plus the few other Latin accents a name here is likely to carry:
 * `translate` folds a fixed list, not Unicode, so a diacritic outside it folds
 * in memory but not in SQL. No extension is installed for this — `unaccent`
 * would need one, a migration and an immutable wrapper to be indexable, and
 * these searches are unindexed substring scans over small tables anyway.
 */
const accentedLetters = "ÁÀÂÄÃÉÈÊËÍÌÎÏÓÒÔÖÕÚÙÛÜÑÇáàâäãéèêëíìîïóòôöõúùûüñç";
const foldedLetters = Array.from(accentedLetters, (letter) =>
  letter.normalize("NFD").replace(/\p{Diacritic}/gu, ""),
).join("");

/**
 * The SQL twin of `matchesListSearch`: a row matches when any of the columns
 * holds the search, compared accent- and case-insensitively. An empty search
 * asks nothing, so the caller can add the result to its conditions as it is.
 */
export function listSearchCondition(
  search: string,
  columns: readonly SQLWrapper[],
): SQL | undefined {
  const foldedSearch = foldSearchText(search);

  if (foldedSearch.length === 0) {
    return undefined;
  }

  const pattern = `%${escapeLikePattern(foldedSearch)}%`;

  return or(
    ...columns.map(
      (column) =>
        sql`lower(translate(${column}, ${accentedLetters}, ${foldedLetters})) like ${pattern}`,
    ),
  );
}

/**
 * Sends the reader to the list's canonical address when the one they asked for
 * holds something else, so the address bar always shows exactly the query that
 * was applied. Called by a list loader once it knows what it applied — the
 * clamped page included.
 *
 * Only what the URL holds is compared, not the order it holds it in: the table
 * writes each filter where the reader clicked it, and reordering that would
 * cost a redirect per click for an address that already says the right thing.
 */
export function redirectToCanonicalListUrl<TColumnId extends string>(
  request: Request,
  input: AppliedListQuery<TColumnId>,
) {
  const url = new URL(request.url);
  const canonicalParams = new URLSearchParams(
    buildCanonicalListSearch({ ...input, currentSearch: url.search }),
  );
  // PROTOTYPE: keep the filters prototype's `?variant=` across the redirect.
  const prototypeVariant = url.searchParams.get("variant");
  if (prototypeVariant) canonicalParams.set("variant", prototypeVariant);
  const canonicalSearch = canonicalParams.toString();

  if (sortSearch(canonicalSearch) !== sortSearch(url.search)) {
    throw redirect(
      canonicalSearch.length > 0
        ? `${url.pathname}?${canonicalSearch}`
        : url.pathname,
    );
  }
}

function sortSearch(search: string) {
  const searchParams = new URLSearchParams(search);

  searchParams.sort();

  return searchParams.toString();
}
