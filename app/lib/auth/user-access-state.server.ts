import { eq, type SQL } from "drizzle-orm";

import { user } from "@/db/schema";
import type { UserAccessState } from "@/lib/auth/user-access-state.shared";

/**
 * The query twin of `toUserAccessState`: the rows it selects are the rows the
 * predicate calls `state`, so a filter cannot disagree with the badge.
 */
export function userAccessStateCondition(state: UserAccessState): SQL {
  return eq(user.suspended, state === "suspended");
}
