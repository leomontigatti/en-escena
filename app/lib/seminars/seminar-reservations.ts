import {
  getSeminarStartsAt,
  type SeminarMoment,
} from "@/lib/seminars/registration-window";

const hourInMilliseconds = 60 * 60 * 1000;

/**
 * How long a registration holds a place before its deposit is covered. It is
 * the only window the quota enforces (docs/domain/seminars.md, "The place").
 */
const SEMINAR_RESERVATION_HOURS = 72;

/**
 * What the academy is told it has to send the deposit: the reservation minus
 * the day administration keeps for recording the payment. It is a promise on
 * screen and nothing reads it as a rule.
 */
const SEMINAR_PAYMENT_DEADLINE_HOURS = 48;

/**
 * Until when a registration made at `now` reserves its place:
 * `SEMINAR_RESERVATION_HOURS` on, never past the seminar's start. Only a
 * registration that finds a place free is given one.
 */
export function getSeminarReservationEndsAt(
  seminar: SeminarMoment,
  now: Date,
): Date {
  return new Date(
    Math.min(
      now.getTime() + SEMINAR_RESERVATION_HOURS * hourInMilliseconds,
      getSeminarStartsAt(seminar).getTime(),
    ),
  );
}

/** Whether a stored reservation still holds its place at `now`. */
export function isSeminarReservationLive(
  reservedUntil: Date | null,
  now: Date,
): boolean {
  return reservedUntil !== null && now.getTime() < reservedUntil.getTime();
}

/**
 * Whether the seminar starts before the deadline the academy would be given by
 * registering at `now`, which is when the registration dialog says "until the
 * seminar starts" instead of the 48 hours.
 */
export function doesSeminarStartBeforePaymentDeadline(
  seminar: SeminarMoment,
  now: Date,
): boolean {
  return (
    getSeminarStartsAt(seminar).getTime() <
    now.getTime() + SEMINAR_PAYMENT_DEADLINE_HOURS * hourInMilliseconds
  );
}
