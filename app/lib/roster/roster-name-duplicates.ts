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

/** Whose academy the reader is looking at: their own, or any, from the panel. */
export type RosterNameScope = "portal" | "admin";

export type RosterNameWarning = DuplicateWarning<
  RosterNameWarningKind,
  RosterNameMatch
> & { scope: RosterNameScope };

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
