import { BUSINESS_TIME_ZONE_UTC_OFFSET } from "@/lib/shared/business-time-zone";

export type SeminarMoment = {
  scheduledDate: string;
  startTime: string;
};

/**
 * The one place `scheduledDate` and `startTime` are put back together. Both are
 * local business values, so the instant they name only exists once the business
 * offset is applied; no reader recombines them by hand, and every caller passes
 * its own `now` so the cut-off is testable to the minute.
 */
export function getSeminarStartsAt(seminar: SeminarMoment) {
  return new Date(
    `${seminar.scheduledDate}T${seminar.startTime}:00${BUSINESS_TIME_ZONE_UTC_OFFSET}`,
  );
}

/**
 * Registration closes when the seminar starts, independently of the event's
 * registration period. A seminar starting exactly now has started: the place is
 * no longer on offer.
 */
export function hasSeminarStarted(seminar: SeminarMoment, now: Date) {
  return now.getTime() >= getSeminarStartsAt(seminar).getTime();
}
