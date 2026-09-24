import { buildInternalAccount } from "@/lib/auth/internal-account";
import type { InternalAccount } from "@/lib/auth/internal-account";
import { requireJudgePanelUser } from "@/lib/auth/internal-navigation.server";
import {
  readJudgePresentations,
  type JudgePresentationRow,
} from "@/lib/judging/judge-list.server";

/**
 * What the judge panel reads. The day is resolved from the current instant on
 * every load, so a judge who leaves the page open across 03:00 sees the day end
 * on the next read rather than keeping a list nothing will accept a score for.
 */

export type JudgePanelRouteData = {
  account: InternalAccount;
  presentations: JudgePresentationRow[];
};

export async function loadJudgePanelRouteData(
  request: Request,
): Promise<JudgePanelRouteData> {
  const user = await requireJudgePanelUser(request);

  return {
    account: buildInternalAccount(user),
    presentations: await readJudgePresentations({ judgeId: user.id }),
  };
}
