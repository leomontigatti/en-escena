import { Badge } from "@/components/ui/badge";
import {
  getUserAccessStateBadgeVariant,
  getUserAccessStateLabel,
  type UserAccessState,
} from "@/lib/auth/user-access-state.shared";

/** A user's `Estado`, as the list and the detail show it. */
export function UserAccessStateBadge({ state }: { state: UserAccessState }) {
  return (
    <Badge variant={getUserAccessStateBadgeVariant(state)}>
      {getUserAccessStateLabel(state)}
    </Badge>
  );
}
