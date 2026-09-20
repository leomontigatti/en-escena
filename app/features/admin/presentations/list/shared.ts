import type { ChoreographyFinancialStatus } from "@/lib/finances/inscription-financial-status";
import type { ChoreographyGroupType } from "@/lib/portal/choreographies";
import type { PresentationWarning } from "@/lib/presentations/warnings";

/**
 * What the participation list's page and its server agree on: the shape of a
 * row, the filters the URL carries and the two intents the page submits. It is
 * a module of its own because the view imports the intents, and the server
 * module it would otherwise take them from cannot reach the browser.
 */

export const orderAutomaticallyIntent = "order-automatically";
export const movePresentationIntent = "move-presentation";

/**
 * A move says nothing when it works — the refreshed list is the answer — so it
 * has a status of its own that carries no message to show.
 */
export type PresentationListActionData =
  { message: string; status: "error" | "success" } | { status: "moved" };

export type PresentationListItem = {
  academyName: string;
  categoryName: string;
  choreographyNumber: number;
  financialStatus: ChoreographyFinancialStatus;
  groupType: ChoreographyGroupType;
  id: string;
  modalityName: string;
  name: string;
  orderNumber: number | null;
  scheduledDate: string;
  submodalityName: string | null;
  warnings: PresentationWarning[];
};

export type PresentationListFilters = {
  day: string | null;
  order: PresentationOrder;
  page: number;
  query: string;
  warnings: "con" | null;
};

export type PresentationOrder = {
  columnId: "orden";
  direction: "asc" | "desc";
};

export type PresentationListResult = {
  canOrder: boolean;
  days: string[];
  filters: PresentationListFilters;
  hasAnyRow: boolean;
  hasPresentations: boolean;
  presentations: PresentationListItem[];
  /** How many presentations the event has, which is the highest number free. */
  presentationCount: number;
  selectedEventId: string | null;
  totalCount: number;
  totalPages: number;
  unorderedCount: number;
  warnedCount: number;
};
