import { buildInternalAccount } from "@/lib/auth/internal-account";
import type { InternalAccount } from "@/lib/auth/internal-account";
import { requireJudgePanelUser } from "@/lib/auth/internal-navigation.server";
import {
  readJudgePresentations,
  type JudgePresentationRow,
} from "@/lib/judging/judge-list.server";
import { judgingDate } from "@/lib/judging/judging-day";

/**
 * What the judge panel reads. The day is resolved from the current instant on
 * every load, so a judge who leaves the page open across 03:00 sees the day end
 * on the next read rather than keeping a list nothing will accept a score for.
 */

export type JudgePanelRouteData = {
  account: InternalAccount;
  /** The judging day the list belongs to, as a `YYYY-MM-DD` date. */
  judgingDate: string;
  presentations: JudgePresentationRow[];
};

export async function loadJudgePanelRouteData(
  request: Request,
): Promise<JudgePanelRouteData> {
  const user = await requireJudgePanelUser(request);
  const now = new Date();

  return {
    account: buildInternalAccount(user),
    judgingDate: judgingDate(now),
    presentations: await readJudgePresentations({ judgeId: user.id, now }),
  };
}
