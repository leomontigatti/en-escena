import { Badge } from "@/components/ui/badge";
import {
  getRosterPersonStatusBadgeVariant,
  getRosterPersonStatusLabel,
  type RosterPersonStatus,
} from "@/lib/roster/roster-person-status.shared";

/**
 * `Estado de alta` as a badge, rendered only when it has something to say: an
 * active person carries no badge, so the column stays about the axes that
 * differ from the norm. It takes the status rather than the `active` column,
 * because the column is the roster module's to interpret.
 */
export function RosterPersonStatusBadge({
  status,
}: {
  status: RosterPersonStatus;
}) {
  if (status === "active") {
    return null;
  }

  return (
    <Badge variant={getRosterPersonStatusBadgeVariant(status)}>
      {getRosterPersonStatusLabel(status)}
    </Badge>
  );
}
