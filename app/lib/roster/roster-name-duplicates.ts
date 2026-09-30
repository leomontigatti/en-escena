import type { RosterScope } from "@/lib/roster/roster-scope";
import type { DuplicateWarning } from "@/lib/shared/duplicate-warning";

/**
 * Everything the warning says about the person already loaded: their display
 * name. The birth date is not carried — for dancers it is by definition the
 * one just typed, so repeating it names nothing new.
 */
export type RosterNameMatch = {
  id: string;
  label: string;
};

export type RosterNameWarningKind = "dancer-name" | "professor-name";

export type RosterNameWarning = DuplicateWarning<
  RosterNameWarningKind,
  RosterNameMatch
> & { scope: RosterScope };

/**
 * What an action answers with when it found a person of the same name: the
 * form shows who and re-submits the same values carrying their ids.
 */
export type RosterNameWarningActionData<Values> = {
  status: "warning";
  warning: RosterNameWarning;
  values: Values;
};

type RosterNameWarningTarget = Pick<RosterNameWarning, "kind" | "scope">;

/**
 * Dancers match on the name and the birth date, professors on the name alone
 * (PRD #1090), and the copy says which. The sentence ends where the list of
 * matches starts: the dialog renders each one as a link.
 */
export function rosterNameWarningIntro({
  kind,
  scope,
}: RosterNameWarningTarget) {
  const person = kind === "dancer-name" ? "un bailarín" : "un profesor";
  const traits =
    kind === "dancer-name"
      ? "el mismo nombre y fecha de nacimiento"
      : "el mismo nombre";
  const academy = scope === "portal" ? "tu academia" : "la academia";

  return `Ya existe ${person} con ${traits} en ${academy}:`;
}

/** The match's page in the area the reader is in. */
export function rosterMatchHref(
  { kind, scope }: RosterNameWarningTarget,
  matchId: string,
) {
  const area = scope === "portal" ? "/portal" : "/administracion";
  const collection = kind === "dancer-name" ? "bailarines" : "profesores";

  return `${area}/${collection}/${matchId}`;
}
