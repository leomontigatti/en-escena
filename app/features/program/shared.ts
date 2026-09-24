import type { ChoreographyGroupType } from "@/lib/portal/choreographies";

/**
 * One row of a program list, the shape both surfaces that show the order to
 * someone who is not the administrator agree on: the academy's own page on the
 * portal and the public program at `/programa`. It carries no warning — the
 * spacing and the block belong to the participation list — and no money beyond
 * whether the deposit is still pending.
 */
export type ProgramListRow = {
  /** The academy the choreography belongs to; shown only on the public page. */
  academyName: string;
  categoryName: string;
  choreographyId: string;
  /** The choreography's own number, unrelated to the order number. */
  choreographyNumber: number;
  /** Filled for a solo and a duo only. */
  dancerNames: string[];
  groupType: ChoreographyGroupType;
  isBelowDeposit: boolean;
  modalityName: string;
  name: string;
  /** `null` for a choreography the administrator has not placed yet. */
  orderNumber: number | null;
  scheduledDate: string;
  submodalityName: string | null;
  /** PROTOTYPE (#223): the published result, made up. */
  prototypeLevelLabel?: string | null;
  prototypeResult?: import("@/features/judging/prototype/results-fixtures").PrototypePublishedResult;
};

export function formatProgramOrderNumber(row: ProgramListRow) {
  return row.orderNumber === null ? "" : String(row.orderNumber);
}

/** The event's days, in order, as the rows themselves report them. */
export function listProgramDays(rows: ProgramListRow[]): string[] {
  return [...new Set(rows.map((row) => row.scheduledDate))].sort();
}
