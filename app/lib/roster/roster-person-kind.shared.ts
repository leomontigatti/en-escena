/**
 * `rosterPersonKind` is the axis everything an academy loads into its roster is
 * written against: a person is either a dancer or a professor. The shared
 * screens, the archive rule, the merge, the seminar inscription and the exports
 * are each written once and asked for the kind's noun here, so no surface
 * carries its own label map.
 *
 * This is the pure half —usable from views and from tests— and it imports
 * nothing. The table-and-column descriptor and the seminar inscription's person
 * arc live in `roster-person-kind.server.ts`.
 */
export type RosterPersonKind = "dancer" | "professor";

/**
 * Who a seminar inscription can name: a roster person, or an `individual`
 * (`Particular`) registering itself (ADR-0019). It is not a roster kind —no
 * roster table holds individuals, and every roster surface keeps
 * `RosterPersonKind`— only the seminar inscription and its readers widen to it.
 */
export type InscriptionPersonKind = RosterPersonKind | "individual";

/** The kinds in the order every grouped surface shows them, dancers first. */
export const rosterPersonKinds = [
  "dancer",
  "professor",
] as const satisfies readonly RosterPersonKind[];

/**
 * The noun forms the sentences need. Agreement beyond the noun —`ese`, `al`,
 * `esos`— is the sentence's own syntax, built around the form it interpolates;
 * a surface that needs a fifth form adds it here rather than writing a map.
 */
export type RosterPersonNounForm =
  /** "bailarín" — mid-sentence. */
  | "singular"
  /** "Bailarín" — a badge, a title, a standalone noun. */
  | "singularCapitalized"
  /** "bailarines" — mid-sentence. */
  | "plural"
  /** "Bailarines" — a section heading. */
  | "pluralCapitalized";

const nouns = {
  dancer: {
    singular: "bailarín",
    singularCapitalized: "Bailarín",
    plural: "bailarines",
    pluralCapitalized: "Bailarines",
  },
  professor: {
    singular: "profesor",
    singularCapitalized: "Profesor",
    plural: "profesores",
    pluralCapitalized: "Profesores",
  },
  individual: {
    singular: "particular",
    singularCapitalized: "Particular",
    plural: "particulares",
    pluralCapitalized: "Particulares",
  },
} as const satisfies Record<
  InscriptionPersonKind,
  Record<RosterPersonNounForm, string>
>;

export function rosterPersonNoun(
  kind: InscriptionPersonKind,
  form: RosterPersonNounForm,
): string {
  return nouns[kind][form];
}

/** The kind's administrative list, which is its plural noun in a URL. */
export function rosterPersonListPath(kind: RosterPersonKind) {
  return `/administracion/${rosterPersonNoun(kind, "plural")}`;
}

/**
 * The not-found sentence of every roster person route and of the merge: the
 * route decides the status code, this the wording.
 */
export function getRosterPersonNotFoundMessage(kind: RosterPersonKind) {
  return `No encontramos ese ${rosterPersonNoun(kind, "singular")}.`;
}
