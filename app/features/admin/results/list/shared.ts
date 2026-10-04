import type { ExperienceLevel } from "@/lib/events/experience-levels";
import type { Award } from "@/lib/judging/award";
import type { PresentationEvaluationStatus } from "@/lib/judging/evaluation-status.server";
import type { ResultsPublication } from "@/lib/judging/results.server";
import type { ChoreographyGroupType } from "@/lib/portal/choreographies";

/**
 * What the administrative results list's page and its server agree on: the
 * shape of a row, the filters the URL carries and the two intents of the
 * publication. A module of its own because the view imports the intents, and
 * the server module cannot reach the browser.
 */

/** `Mostrar resultados` and `Actualizar resultados` alike: both publish what is evaluated now. */
export const publishResultsIntent = "publish-results";
export const hideResultsIntent = "hide-results";
/**
 * The event the confirmation was shown for. The action acts on the active
 * event, and refuses when this is no longer it: another administrator may
 * have switched events while the dialog was open.
 */
export const resultsEventIdFieldName = "evento";

export type ResultsListActionData = {
  message: string;
  status: "error" | "success";
};

export type ResultsListItem = {
  academyName: string;
  /** Live, off the saved scores: null while nothing counts and when disqualified. */
  average: number | null;
  award: Award | null;
  categoryName: string;
  choreographyNumber: number;
  evaluationStatus: PresentationEvaluationStatus;
  /** The choreography's level; `null` when its category admits none. */
  experienceLevel: ExperienceLevel | null;
  groupType: ChoreographyGroupType;
  id: string;
  modalityName: string;
  name: string;
  orderNumber: number;
  presentationId: string;
  /** Whether the academy reads this result now: inside the snapshot, with the event's out. */
  published: boolean;
  scheduledDate: string;
  submodalityName: string | null;
};

export type ResultsOrder = {
  columnId: "orden";
  direction: "asc" | "desc";
};

export type ResultsListFilters = {
  day: string | null;
  order: ResultsOrder;
  page: number;
  query: string;
};

export type ResultsListResult = {
  canPublish: boolean;
  days: string[];
  filters: ResultsListFilters;
  hasAnyRow: boolean;
  /** The days the results export offers: the ones with a result, in order. */
  exportDays: string[];
  publication: ResultsPublication;
  results: ResultsListItem[];
  selectedEventId: string | null;
  totalCount: number;
  totalPages: number;
};

/**
 * Where the row's name leads: the scores view once the panel has reached the
 * presentation, as on the presentations list; nothing before that.
 */
export function resultRowPath(row: ResultsListItem) {
  return row.evaluationStatus === "pending"
    ? null
    : `/administracion/presentaciones/${row.presentationId}/puntajes`;
}
