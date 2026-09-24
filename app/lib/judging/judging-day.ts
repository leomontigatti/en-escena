import { getBusinessDateOnly } from "@/lib/shared/business-time-zone";

/**
 * Which day the judges are working on, and therefore which presentations they
 * can see and write. A show runs past midnight, so the day it belongs to is the
 * business date of three hours ago: it starts with the date and lasts until
 * 03:00 the next morning, when it closes for good. See docs/domain/judging.md,
 * "Scores And Feedback".
 *
 * It is computed on read from the current instant, so there is no flag to set,
 * no job to close the day, and nothing to go stale if a show runs long.
 */

const judgingDayOffsetMs = 3 * 60 * 60 * 1000;

/** The judging day as a `YYYY-MM-DD` business date, comparable to a schedule's. */
export function judgingDate(now: Date = new Date()): string {
  return getBusinessDateOnly(new Date(now.getTime() - judgingDayOffsetMs));
}

/**
 * Whether the presentations of a schedule are open for their judges: before its
 * date there is nothing to score yet, and after 03:00 the next day every judge
 * write is refused.
 */
export function isOpenForJudges(
  scheduledDate: string,
  now: Date = new Date(),
): boolean {
  return scheduledDate === judgingDate(now);
}
