import { buildInternalAccount } from "@/lib/auth/internal-account";
import type { InternalAccount } from "@/lib/auth/internal-account";
import { requireJudgePanelUser } from "@/lib/auth/internal-navigation.server";
import {
  readJudgeAssignedDays,
  readJudgePresentations,
  type JudgePresentationRow,
} from "@/lib/judging/judge-list.server";
import { isOpenForJudges, judgingDate } from "@/lib/judging/judging-day";
import { dayTabParam } from "@/lib/shared/url-tab";

/**
 * What the judge panel reads. The list opens on the judging day, resolved from
 * the current instant on every load, so a judge who leaves the page open across
 * 03:00 sees the day end on the next read rather than keeping a list nothing
 * will accept a score for.
 *
 * The judge may also look at any other day they have presentations on, named
 * in the URL, to see what they scored or what is coming. That day is only
 * read: `isOpen` is what the view gates every way into the score form on, and
 * the write itself is refused on its own, whatever the list shows.
 */

export type JudgePanelRouteData = {
  account: InternalAccount;
  /** The day the list shows, as a `YYYY-MM-DD` date. */
  day: string;
  /**
   * The days the judge can switch to, empty when there is no other day than
   * the judging day to switch to. The judging day is among them only when the
   * judge has presentations on it.
   */
  dayOptions: string[];
  /** Whether `day` is the judging day, the only one a judge can score on. */
  isOpen: boolean;
  /** The judging day, as a `YYYY-MM-DD` date. */
  judgingDate: string;
  presentations: JudgePresentationRow[];
};

export async function loadJudgePanelRouteData(
  request: Request,
): Promise<JudgePanelRouteData> {
  const user = await requireJudgePanelUser(request);
  const now = new Date();
  const today = judgingDate(now);
  const assignedDays = await readJudgeAssignedDays({ judgeId: user.id });
  const requestedDay = new URL(request.url).searchParams.get(dayTabParam);
  // Only a day the judge has presentations on is honoured: anything else in
  // the URL, a stale link or a typo, is the judging day.
  const day =
    requestedDay !== null && assignedDays.includes(requestedDay)
      ? requestedDay
      : today;

  return {
    account: buildInternalAccount(user),
    day,
    dayOptions: assignedDays.some((assignedDay) => assignedDay !== today)
      ? assignedDays
      : [],
    isOpen: isOpenForJudges(day, now),
    judgingDate: today,
    presentations: await readJudgePresentations({
      judgeId: user.id,
      scheduledDate: day,
    }),
  };
}
