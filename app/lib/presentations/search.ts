import { foldSearchText } from "@/lib/list-query/list-query";

/**
 * What a presentation is found by, on every list of the order: the admin's,
 * the academy's and the public program. The academy is there only where the
 * list shows it.
 */
export type PresentationSearchTarget = {
  academyName?: string;
  choreographyNumber: number;
  name: string;
  /** `null` for a row not yet in the order, which no number finds. */
  orderNumber: number | null;
};

const digitsOnly = /^\d+$/;

/**
 * Names and academies match by any part of them; a search of digits alone is a
 * number, matched whole against the presentation's and the choreography's own,
 * so `12` does not also bring 112 and 120. The choreography number's padding
 * (`00012`) is a way of writing it, so it is read as the same number.
 */
export function matchesPresentationSearch(
  query: string,
  target: PresentationSearchTarget,
) {
  const folded = foldSearchText(query);

  if (folded.length === 0) {
    return true;
  }

  if (digitsOnly.test(folded)) {
    const number = Number(folded);

    if (target.orderNumber === number || target.choreographyNumber === number) {
      return true;
    }
  }

  return [target.name, target.academyName ?? ""].some((value) =>
    foldSearchText(value).includes(folded),
  );
}
