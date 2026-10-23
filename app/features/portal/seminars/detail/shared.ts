import type { InscriptionStatusBadge } from "@/lib/finances/inscription-financial-status";
import type { InscriptionPersonKind } from "@/lib/roster/roster-person-kind.shared";

import type {
  deletePortalSeminarInscriptionIntent,
  PortalSeminarPersonOption,
  registerPortalSeminarInscriptionIntent,
} from "../shared";

export type PortalSeminarDetailInscription = {
  id: string;
  fullName: string;
  personKind: InscriptionPersonKind;
  /** Whether taking it off the seminar withdraws the row instead of deleting
   * it, which is the only thing the portal reads of a seminar inscription's
   * money: the amount itself belongs to `Resumen financiero`. */
  hasMoney: boolean;
  /** A linked individual's own inscription (ADR-0019): the academy sees the
   * person is registered, under the `Particular` kind, and can neither remove
   * it nor read anything of its money. */
  readOnly: boolean;
  /** The `Estado` badge the finance lists give the row: `Reservada` while its
   * reservation holds, `Seña pendiente` once it lapses, then `Señada` and
   * `Pagada`. `null` on a read-only row, whose money is the individual's. */
  status: InscriptionStatusBadge | null;
};

export type PortalSeminarDetailSeminar = {
  id: string;
  instructorName: string;
  scheduledDate: string;
  startTime: string;
  hasStarted: boolean;
  hasRegistrationPrices: boolean;
  /** Whether covered and reserved inscriptions already fill the quota. It
   * closes nothing — registration is unlimited — and is said as a notice,
   * because a new registration reserves nothing and a deposit covered from here
   * on would be refused on administration's side (docs/domain/seminars.md,
   * "The place"). */
  isFull: boolean;
  /** Whether the seminar starts inside the 48 hours a new registration is
   * given to send its deposit, so the dialog says "until it starts" instead. */
  startsBeforePaymentDeadline: boolean;
  /** The seminar's own `Seña (%)`, which splits a price into its
   * `Derecho de inscripción` and `Derecho de participación`. */
  requiredDepositPercentage: number;
};

/** A person the academy may still register, with what registering them would
 * cost today: their participant cell decides the row. `null` when nothing
 * prices them, which a seminar open for registration rules out. */
export type PortalSeminarDetailPersonOption = PortalSeminarPersonOption & {
  priceAmount: number | null;
};

export type PortalSeminarDetailLoaderData = {
  seminar: PortalSeminarDetailSeminar;
  /** The academy's own **active** inscriptions; a withdrawn row is off the
   * roster and is read on the finance surfaces instead. After them, read-only,
   * the inscriptions linked individuals made for themselves. */
  inscriptions: PortalSeminarDetailInscription[];
  people: PortalSeminarDetailPersonOption[];
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
