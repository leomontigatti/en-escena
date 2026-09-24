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

/**
 * Dancers match on the name and the birth date, professors on the name alone
 * (PRD #1090), and the copy says which.
 */
export function rosterNameWarningMessage(warning: RosterNameWarning) {
  const person = warning.kind === "dancer-name" ? "un Bailarín" : "un Profesor";
  const traits =
    warning.kind === "dancer-name"
      ? "el mismo nombre y fecha de nacimiento"
      : "el mismo nombre";
  const academy = warning.scope === "portal" ? "tu academia" : "la academia";
  const names = warning.matches.map((match) => match.label).join(", ");

  return `Ya existe ${person} con ${traits} en ${academy}: ${names}. ¿Es la misma persona?`;
}
