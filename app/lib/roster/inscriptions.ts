import type { ChoreographyGroupType } from "@/lib/portal/choreographies";
import type { SeminarKind } from "@/lib/seminars/seminar-kinds";

/**
 * One choreography on the inscriptions tab of a roster person's ficha. A
 * withdrawn one stays on the tab as evidence: for a dancer that is a withdrawn
 * inscription, for a professor a withdrawn choreography.
 */
export type RosterChoreography = {
  id: string;
  choreographyName: string;
  choreographyNumber: number;
  eventName: string;
  categoryName: string;
  groupType: ChoreographyGroupType;
};

/**
 * One row of the seminars tab of a roster person's ficha, priced by the seminar
 * finance read model. A seminar inscription has no `Descuento por bailarín`, so
 * its one figure is its total: what it must pay, or on a withdrawn row what
 * remains allocated to it.
 */
export type RosterSeminarInscription = {
  id: string;
  seminarId: string;
  instructorName: string;
  eventName: string;
  kind: SeminarKind;
  scheduledDate: string;
  startTime: string;
  totalAmount: number | null;
};
