import { rosterPersonNoun } from "@/lib/roster/roster-person-kind.shared";

/**
 * What an owner row is (ADR-0019): an `academy`, or an `individual`
 * (`Particular`) that owns its inscriptions and money through the same row.
 * This is the client-safe half: the label a surface that shows both kinds
 * prints, and the value its `Tipo` facet filters by. The SQL predicate that
 * keeps individuals out of academy enumerations is `owner-kind.server.ts`.
 */
export type OwnerKind = "academy" | "individual";

/** The kinds in the order a `Tipo` facet offers them, academies first. */
export const ownerKinds = [
  "academy",
  "individual",
] as const satisfies readonly OwnerKind[];

/** `Academia` or `Particular`: a badge, a facet option. */
export function ownerKindLabel(kind: OwnerKind): string {
  return kind === "academy"
    ? "Academia"
    : rosterPersonNoun("individual", "singularCapitalized");
}

/** The `Tipo` facet's value for a kind, a stable slug for the URL. */
export function ownerKindFilterValue(kind: OwnerKind): string {
  return kind === "academy" ? "academia" : "particular";
}
