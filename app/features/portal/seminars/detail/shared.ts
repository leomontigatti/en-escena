import type { RosterPersonKind } from "@/lib/roster/roster-person-status.shared";

import type {
  deletePortalSeminarInscriptionIntent,
  PortalSeminarPersonOption,
  registerPortalSeminarInscriptionIntent,
} from "../shared";

export type PortalSeminarDetailInscription = {
  id: string;
  fullName: string;
  personKind: RosterPersonKind;
  /** Whether taking it off the seminar withdraws the row instead of deleting
   * it, which is the only thing the portal reads of a seminar inscription's
   * money: the amount itself belongs to `Resumen financiero`. */
  hasMoney: boolean;
};

export type PortalSeminarDetailSeminar = {
  id: string;
  instructorName: string;
  scheduledDate: string;
  startTime: string;
  hasStarted: boolean;
  hasRegistrationPrices: boolean;
  /** Whether covered inscriptions already fill the quota. It closes nothing —
   * registration is unlimited — and is said as a notice, because a deposit
   * covered from here on would be refused on administration's side
   * (docs/domain/seminars.md, "The place"). */
  isFull: boolean;
};

export type PortalSeminarDetailLoaderData = {
  seminar: PortalSeminarDetailSeminar;
  /** The academy's own **active** inscriptions; a withdrawn row is off the
   * roster and is read on the finance surfaces instead. */
  inscriptions: PortalSeminarDetailInscription[];
  people: PortalSeminarPersonOption[];
};

export type PortalSeminarDetailActionData =
  | {
      intent:
        | typeof deletePortalSeminarInscriptionIntent
        | typeof registerPortalSeminarInscriptionIntent;
      message: string;
      status: "error" | "success";
    }
  | undefined;
