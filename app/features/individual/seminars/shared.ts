import type { InscriptionStatusBadge } from "@/lib/finances/inscription-financial-status";
import { INDIVIDUAL_AREA_PATH } from "@/lib/auth/user-role.shared";

/**
 * `Seminarios` in the individual's area (ADR-0019): the active event's
 * seminars, each with what the individual would pay or pays, and its own
 * inscription in it when it holds one. Registration and removal happen on the
 * same page, one seminar at a time, under the academies' rules.
 */

export const individualSeminarsPath = `${INDIVIDUAL_AREA_PATH}/seminarios`;

export const registerIndividualSeminarInscriptionIntent =
  "register-seminar-inscription";
export const deleteIndividualSeminarInscriptionIntent =
  "delete-seminar-inscription";

/** The individual's own **active** inscription in one seminar. */
export type IndividualSeminarInscription = {
  id: string;
  /** Whether removing it withdraws the row instead of deleting it. */
  hasMoney: boolean;
  /** The `Estado` badge the finance lists give the row. */
  status: InscriptionStatusBadge;
};

export type IndividualSeminarRow = {
  id: string;
  instructorName: string;
  scheduledDate: string;
  startTime: string;
  /**
   * What the individual pays: its inscription's effective price once it holds
   * one, today's ordinary price of the seminar otherwise. Null when nothing
   * prices it, which a seminar open for registration rules out.
   */
  priceAmount: number | null;
  hasStarted: boolean;
  /** Covered and reserved inscriptions already fill the quota: a new
   * registration gets no place until one is freed. It closes nothing. */
  isFull: boolean;
  /** The seminar starts inside the window a new registration is given to send
   * its deposit. */
  startsBeforePaymentDeadline: boolean;
  inscription: IndividualSeminarInscription | null;
};

export type IndividualSeminarsLoaderData = {
  hasActiveEvent: boolean;
  /** Whether the event's price list lets anybody register yet. */
  hasRegistrationPrices: boolean;
  seminars: IndividualSeminarRow[];
};

export type IndividualSeminarsActionData =
  | {
      intent:
        | typeof deleteIndividualSeminarInscriptionIntent
        | typeof registerIndividualSeminarInscriptionIntent;
      message: string;
      status: "error" | "success";
    }
  | undefined;
