import { DuplicateWarningPrompt } from "@/components/shared/duplicate-warning-prompt";
import {
  rosterNameWarningMessage,
  type RosterNameWarning,
} from "@/lib/roster/roster-name-duplicates";

/**
 * The form side of the same-name warning: who the academy already has, and a
 * submit that repeats the values carrying their ids.
 */
export function RosterNameWarningNotice({
  warning,
}: {
  warning: RosterNameWarning;
}) {
  return (
    <DuplicateWarningPrompt matchIds={warning.matches.map((match) => match.id)}>
      <p>{rosterNameWarningMessage(warning)}</p>
    </DuplicateWarningPrompt>
  );
}
