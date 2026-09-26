import { z } from "zod";

import type { ExperienceLevel } from "@/lib/events/experience-levels";
import type { ChoreographyFinancialStatus } from "@/lib/finances/inscription-financial-status";
import type { PresentationEvaluationStatus } from "@/lib/judging/evaluation-status.server";
import type { AssignableJudge } from "@/lib/presentations/judge-assignments.server";
import type { ChoreographyGroupType } from "@/lib/portal/choreographies";
import type { PresentationWarning } from "@/lib/presentations/warnings";
import { requiredFieldMessage } from "@/lib/shared/forms";

/**
 * What the participation list's page and its server agree on: the shape of a
 * row, the filters the URL carries and the two intents the page submits. It is
 * a module of its own because the view imports the intents, and the server
 * module it would otherwise take them from cannot reach the browser.
 */

export const orderAutomaticallyIntent = "order-automatically";
export const movePresentationIntent = "move-presentation";
export const assignJudgesIntent = "assign-judges";
export const removeJudgesIntent = "remove-judges";
export const judgeIdFieldName = "juez";
export const presentationChoreographyIdFieldName = "coreografia";

/**
 * What both judge dialogs submit, and what the action parses back out of the
 * `FormData`. One schema for the two directions: they carry the same pair of
 * sets and differ only in the intent, so the form and the server can hold each
 * other to the same shape instead of the server re-deriving it by hand.
 *
 * The selection travels as a form value like the judges do, so an empty one is
 * a validation failure of the form rather than a disabled button.
 */
export const judgeAssignmentSchema = z.object({
  intent: z.enum([assignJudgesIntent, removeJudgesIntent]),
  [presentationChoreographyIdFieldName]: z
    .array(z.string().trim().min(1))
    .min(1, requiredFieldMessage),
  [judgeIdFieldName]: z
    .array(z.string().trim().min(1))
    .min(1, requiredFieldMessage),
});

export type JudgeAssignmentFormValues = z.input<typeof judgeAssignmentSchema>;
export type JudgeAssignmentSubmissionValues = z.output<
  typeof judgeAssignmentSchema
>;

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
  /** Where the presentation stands for the panel, which decides the row's badge. */
  evaluationStatus: PresentationEvaluationStatus;
  /** The choreography's level; `null` when its category admits none. */
  experienceLevel: ExperienceLevel | null;
  financialStatus: ChoreographyFinancialStatus;
  /**
   * `Presentación fija`: its schedule already has an evaluated presentation,
   * so its number is neither moved nor offered as a place to move to.
   */
  frozen: boolean;
  groupType: ChoreographyGroupType;
  id: string;
  modalityName: string;
  name: string;
  orderNumber: number | null;
  /** Who already judges the row, which is what the removal dialog offers. */
  assignedJudgeIds: string[];
  /** `null` while the choreography has no presentation, so nothing to score. */
  presentationId: string | null;
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
  /** Every judge the assignment dialog may offer: the role, minus suspended. */
  assignableJudges: AssignableJudge[];
  /** The judges on the listed rows, named, for the removal dialog. */
  assignedJudges: AssignableJudge[];
  canOrder: boolean;
  days: string[];
  filters: PresentationListFilters;
  /** How many presentations the next automatic ordering will leave in place. */
  frozenCount: number;
  hasAnyRow: boolean;
  hasPresentations: boolean;
  /** The highest number in the order; `0` before the first ordering. */
  highestOrderNumber: number;
  presentations: PresentationListItem[];
  selectedEventId: string | null;
  totalCount: number;
  totalPages: number;
  unorderedCount: number;
  warnedCount: number;
};

/**
 * Which judges the removal dialog offers: the ones at least one of the chosen
 * rows actually has, in the order the loader named them. Offering a judge
 * nobody in the selection carries would be offering to remove nothing.
 */
export function selectRemovableJudges(
  assignedJudges: AssignableJudge[],
  selectedRows: PresentationListItem[],
): AssignableJudge[] {
  const judgeIds = new Set(selectedRows.flatMap((row) => row.assignedJudgeIds));

  return assignedJudges.filter((judge) => judgeIds.has(judge.id));
}

/**
 * What each dialog says when it closes. It names what was reached rather than
 * what was asked for: an already assigned pair is skipped and a judge nobody
 * had is a removal of nothing, so both counts are of rows actually touched.
 *
 * A removal also reports what it refused to touch. A pair that already has a
 * score cannot be taken apart without orphaning the score, so removal keeps it
 * and says so here — beside the success when the rest went, and alone when
 * there was no rest, which is what a single scored assignment looks like.
 */
export function formatJudgeAssignmentMessage(input: {
  intent: typeof assignJudgesIntent | typeof removeJudgesIntent;
  judgeCount: number;
  /** Scored pairs the removal kept; a removal that kept none, or an assignment. */
  keptCount?: number;
  presentationCount: number;
}) {
  const isAssigning = input.intent === assignJudgesIntent;
  const keptCount = input.keptCount ?? 0;

  if (!isAssigning && keptCount > 0 && input.judgeCount === 0) {
    const kept =
      keptCount === 1
        ? "1 asignación ya tiene puntaje"
        : `${keptCount} asignaciones ya tienen puntaje`;

    return `No se quitó nada: ${kept}.`;
  }

  // The verb agrees with the judges and the preposition with the direction:
  // a judge is assigned *to* a presentation and taken *off* one.
  const verb = isAssigning
    ? input.judgeCount === 1
      ? "Se asignó"
      : "Se asignaron"
    : input.judgeCount === 1
      ? "Se quitó"
      : "Se quitaron";
  const judges =
    input.judgeCount === 1 ? "1 juez" : `${input.judgeCount} jueces`;
  const presentations =
    input.presentationCount === 1
      ? "1 presentación"
      : `${input.presentationCount} presentaciones`;

  const reached = `${verb} ${judges} ${isAssigning ? "a" : "de"} ${presentations}.`;

  if (keptCount === 0) {
    return reached;
  }

  const kept =
    keptCount === 1
      ? "Se mantuvo 1 asignación que ya tiene puntaje."
      : `Se mantuvieron ${keptCount} asignaciones que ya tienen puntaje.`;

  return `${reached} ${kept}`;
}

/**
 * What the ordering says when it is done: the rows it placed and, when a
 * schedule had already run, the rows it left where they were.
 */
export function formatAutomaticOrderingMessage(input: {
  frozenCount: number;
  orderedCount: number;
}) {
  const ordered =
    input.orderedCount === 1
      ? "Se ordenó 1 presentación."
      : `Se ordenaron ${input.orderedCount} presentaciones.`;

  if (input.frozenCount === 0) {
    return ordered;
  }

  const frozen =
    input.frozenCount === 1
      ? "Quedó fija 1 porque su cronograma ya fue evaluado."
      : `Quedaron fijas ${input.frozenCount} porque su cronograma ya fue evaluado.`;

  return `${ordered} ${frozen}`;
}

/**
 * Where the row's name leads. A presentation the panel has already judged is
 * read through its scores and not through its choreography: during the show
 * that is what an administrator opens a row for, and the scores view links on
 * to the choreography for the rest.
 */
export function presentationRowPath(row: PresentationListItem) {
  if (row.evaluationStatus !== "pending" && row.presentationId !== null) {
    return `/administracion/presentacion/${row.presentationId}/puntajes`;
  }

  return `/administracion/coreografias/${row.id}`;
}
