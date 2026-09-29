import { DuplicateWarningPrompt } from "@/components/shared/duplicate-warning-prompt";
import {
  rosterNameWarningMessage,
  type RosterNameWarning,
} from "@/lib/roster/roster-name-duplicates";

/**
 * The confirmation a save asks for when the academy already has someone with
 * that name: who they are, and a submit that repeats the values carrying their
 * ids.
 */
export function RosterNameWarningDialog({
  formId,
  warning,
}: {
  formId: string;
  warning: RosterNameWarning;
}) {
  return (
    <DuplicateWarningPrompt
      formId={formId}
      matchIds={warning.matches.map((match) => match.id)}
      title="¿Es la misma persona?"
      warning={warning}
    >
      <p>{rosterNameWarningMessage(warning)}</p>
    </DuplicateWarningPrompt>
  );
}
