import { Check } from "lucide-react";

import {
  DuplicateMatchLink,
  DuplicateWarningPrompt,
  joinSpanishList,
} from "@/components/shared/duplicate-warning-prompt";
import {
  rosterMatchHref,
  rosterNameWarningIntro,
  type RosterNameWarning,
} from "@/lib/roster/roster-name-duplicates";

/**
 * The confirmation a save asks for when the academy already has someone with
 * that name: who they are, each linking to their page, and a submit that
 * repeats the values carrying their ids.
 */
export function RosterNameWarningDialog({
  formId,
  isPending,
  warning,
}: {
  formId: string;
  isPending: boolean;
  warning: RosterNameWarning;
}) {
  return (
    <DuplicateWarningPrompt
      formId={formId}
      isPending={isPending}
      matchIds={warning.matches.map((match) => match.id)}
      confirmIcon={Check}
      confirmLabel="Guardar"
      title={
        warning.kind === "dancer-name"
          ? "¿Guardar el bailarín?"
          : "¿Guardar el profesor?"
      }
      warning={warning}
    >
      <p>
        {rosterNameWarningIntro(warning)}{" "}
        {joinSpanishList(
          warning.matches.map((match) => (
            <DuplicateMatchLink
              key={match.id}
              href={rosterMatchHref(warning, match.id)}
            >
              {match.label}
            </DuplicateMatchLink>
          )),
        )}
        .
      </p>
    </DuplicateWarningPrompt>
  );
}
