import { Info } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";

/**
 * Why the `Archivar` action is unavailable: the person holds a live commitment
 * in the active event. Informational, not destructive — nothing is wrong when
 * it shows, the action is simply unavailable — which is what keeps it distinct
 * from `ArchivedPersonAlert`, the alert for people who are *already* archived.
 *
 * The sentence comes from `roster-person-status.shared.ts` through the view
 * model of each screen, so the four detail screens cannot word the same
 * refusal four ways.
 */
export function RosterPersonParticipatingAlert({
  message,
}: {
  message: string;
}) {
  return (
    <Alert variant="info">
      <Info aria-hidden="true" />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
