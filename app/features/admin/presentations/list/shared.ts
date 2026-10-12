import { z } from "zod";

import type { ExperienceLevel } from "@/lib/events/experience-levels";
import type { ChoreographyFinancialStatus } from "@/lib/finances/inscription-financial-status";
import type { PresentationEvaluationStatus } from "@/lib/judging/evaluation-status.server";
import type {
  AssignableJudge,
  JudgeAssignmentResult,
  JudgeRemovalResult,
} from "@/lib/presentations/judge-assignments.server";
import type { ChoreographyGroupType } from "@/lib/portal/choreographies";
import type { PresentationWarning } from "@/lib/presentations/warnings";
import { formatScheduleDayTabLabel } from "@/lib/choreographies/schedule-formatters";
import { isDateOnly } from "@/lib/shared/date-only";
import { requiredFieldMessage } from "@/lib/shared/forms";
import { formatSpanishList } from "@/lib/shared/text-normalization";

import type { MusicDownloadDay } from "../music-download/shared";

/**
 * What the participation list's page and its server agree on: the shape of a
 * row, the filters the URL carries and the intents the page submits. It is
 * a module of its own because the view imports the intents, and the server
 * module it would otherwise take them from cannot reach the browser.
 */

export const orderAutomaticallyIntent = "order-automatically";
export const movePresentationIntent = "move-presentation";
export const editJudgesIntent = "edit-judges";
export const setProgramVisibilityIntent = "set-program-visibility";
/**
 * One value per day whose program should be visible, repeated: the days the
 * submission leaves out are hidden, so an empty one hides the whole program.
 */
export const programVisibleDayFieldName = "dia";
/**
 * One value per day the automatic ordering covers, repeated; none orders the
 * whole event.
 */
export const orderDayFieldName = "dia";
/** The event the dialog was opened for, so a switch in between is refused. */
export const programEventIdFieldName = "evento";
/** One value per judge the edit puts on every chosen row, repeated. */
export const judgeToAddFieldName = "agregar";
/** One value per judge the edit takes off every chosen row, repeated. */
export const judgeToRemoveFieldName = "quitar";
export const presentationChoreographyIdFieldName = "coreografia";

/**
 * What the judge dialog submits, and what the action parses back out of the
 * `FormData`: the change, not the state asked for. A judge left as it was is in
 * neither set, so a judge on some of the chosen rows stays on exactly those.
 *
 * The selection travels as a form value like the judges do, so an empty one is
 * a validation failure of the form rather than a disabled button.
 */
export const judgeEditSchema = z
  .object({
    intent: z.literal(editJudgesIntent),
    [presentationChoreographyIdFieldName]: z
      .array(z.string().trim().min(1))
      .min(1, requiredFieldMessage),
    [judgeToAddFieldName]: z.array(z.string().trim().min(1)),
    [judgeToRemoveFieldName]: z.array(z.string().trim().min(1)),
  })
  .refine(
    (value) =>
      value[judgeToAddFieldName].length + value[judgeToRemoveFieldName].length >
      0,
    { message: "Cambiá al menos un juez.", path: [judgeToAddFieldName] },
  )
  .refine(
    (value) =>
      !value[judgeToAddFieldName].some((judgeId) =>
        value[judgeToRemoveFieldName].includes(judgeId),
      ),
    {
      message: "Un juez no puede agregarse y quitarse a la vez.",
      path: [judgeToRemoveFieldName],
    },
  );

/**
 * What the program visibility dialog submits besides its intent and event:
 * the whole set of days to leave visible, possibly none. It is the state asked
 * for and not a change to it, so the same submission twice is one write.
 */
export const programVisibilitySchema = z.object({
  [programVisibleDayFieldName]: z.array(
    z.string().refine(isDateOnly, "Elegí un día válido."),
  ),
});

/** What the automatic ordering submits besides its intent: the days, if any. */
export const automaticOrderingSchema = z.object({
  [orderDayFieldName]: z.array(
    z.string().refine(isDateOnly, "Elegí un día válido."),
  ),
});

export type AutomaticOrderingFormValues = z.infer<
  typeof automaticOrderingSchema
>;

export type ProgramVisibilityFormValues = z.infer<
  typeof programVisibilitySchema
>;

export type JudgeEditFormValues = z.input<typeof judgeEditSchema>;
export type JudgeEditSubmissionValues = z.output<typeof judgeEditSchema>;

/**
 * A move says nothing when it works — the refreshed list is the answer — so its
 * success carries no message to show, and readers key on `message`, not on the
 * status.
 */
export type PresentationListActionData =
  { message: string; status: "error" | "success" } | { status: "success" };

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
  /** Who already judges the row, which the judge dialog starts from. */
  assignedJudgeIds: string[];
  /** `null` while the choreography has no presentation, so nothing to score. */
  presentationId: string | null;
  /** `Evaluar como profesional`, which the `evaluacion` facet narrows to. */
  professionalEvaluation: boolean;
  scheduledDate: string;
  submodalityName: string | null;
  warnings: PresentationWarning[];
};

export type PresentationListFilters = {
  /** The day on screen: the first unless the URL names another. */
  day: string | null;
  /** The one value of the `evaluacion` facet; `null` shows every row. */
  evaluation: "profesional" | null;
  order: PresentationOrder;
  query: string;
  warnings: "con" | null;
};

export type PresentationOrder = {
  columnId: "orden";
  direction: "asc" | "desc";
};

export type PresentationListResult = {
  /** Every judge the judge dialog may add: the role, minus suspended. */
  assignableJudges: AssignableJudge[];
  /** The judges on the listed rows, named, so the dialog can take any off. */
  assignedJudges: AssignableJudge[];
  canOrder: boolean;
  /** The rows of the chosen day, before the search and the facets narrow it. */
  dayRowCount: number;
  days: string[];
  filters: PresentationListFilters;
  /**
   * The days with a presentation the automatic ordering leaves in place, in
   * date order.
   */
  frozenDays: string[];
  hasAnyRow: boolean;
  hasPresentations: boolean;
  /** The days the music download offers, in date order. */
  musicDownloadDays: MusicDownloadDay[];
  /** The highest number in the order; `0` before the first ordering. */
  highestOrderNumber: number;
  presentations: PresentationListItem[];
  /**
   * The days whose program the public page and the academies' portal show, in
   * date order; every other day is hidden.
   */
  programVisibleDays: string[];
  /** The days the program export offers: the ones with a numbered row. */
  programExportDays: string[];
  selectedEventId: string | null;
  unorderedCount: number;
  warnedCount: number;
};

/** Where a judge stands across the chosen rows: on all of them, some, none. */
export type JudgeChoiceState = "all" | "none" | "some";

export type JudgeChoice = AssignableJudge & {
  /** `false` for a suspended judge: one the dialog can take off, never add. */
  assignable: boolean;
  state: JudgeChoiceState;
};

/**
 * The judges the dialog offers, each with where it stands across the chosen
 * rows, which is what its checkbox starts from. Every assignable judge, then
 * any the selection has that is no longer assignable — a suspended one — so it
 * can still be taken off.
 */
export function readJudgeChoices({
  assignableJudges,
  assignedJudges,
  selectedRows,
}: {
  assignableJudges: AssignableJudge[];
  assignedJudges: AssignableJudge[];
  selectedRows: PresentationListItem[];
}): JudgeChoice[] {
  const assignableIds = new Set(assignableJudges.map((judge) => judge.id));
  const onSelection = new Set(
    selectedRows.flatMap((row) => row.assignedJudgeIds),
  );
  const judges = [
    ...assignableJudges,
    ...assignedJudges.filter(
      (judge) => onSelection.has(judge.id) && !assignableIds.has(judge.id),
    ),
  ];

  return judges.map((judge) => {
    const count = selectedRows.filter((row) =>
      row.assignedJudgeIds.includes(judge.id),
    ).length;

    return {
      ...judge,
      assignable: assignableIds.has(judge.id),
      state: readJudgeChoiceState(count, selectedRows.length),
    };
  });
}

function readJudgeChoiceState(
  assignedCount: number,
  rowCount: number,
): JudgeChoiceState {
  if (assignedCount === 0) {
    return "none";
  }

  if (assignedCount === rowCount) {
    return "all";
  }

  return "some";
}

/**
 * What each direction of the judge dialog says when it closes; an edit that
 * does both says both, the assignment first. It names what was reached rather than
 * what was asked for: an already assigned pair is skipped and a judge nobody
 * had is a removal of nothing, so both counts are of rows actually touched.
 *
 * A removal also reports what it refused to touch. A pair that already has a
 * score cannot be taken apart without orphaning the score, so removal keeps it
 * and says so here — beside the success when the rest went, and alone when
 * there was no rest, which is what a single scored assignment looks like.
 */
export function formatJudgeAssignmentMessage(input: {
  direction: "assign" | "remove";
  judgeCount: number;
  /** Scored pairs the removal kept; a removal that kept none, or an assignment. */
  keptCount?: number;
  presentationCount: number;
}) {
  const isAssigning = input.direction === "assign";
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
 * What a judge edit says, given what each half reached (`null` for a half it
 * did not ask for): the assignment first, then the removal. An edit that
 * reached nothing because every pair it would take apart already has a score
 * is `refused`, not a quiet success: the message is all the administrator
 * gets, so it has to arrive in the tone of one.
 */
export function readJudgeEditOutcome({
  assigned,
  removed,
}: {
  assigned: JudgeAssignmentResult | null;
  removed: JudgeRemovalResult | null;
}) {
  const parts: string[] = [];

  if (assigned) {
    parts.push(
      formatJudgeAssignmentMessage({ direction: "assign", ...assigned }),
    );
  }

  if (removed) {
    parts.push(
      formatJudgeAssignmentMessage({ direction: "remove", ...removed }),
    );
  }

  const reachedNothing =
    (assigned?.judgeCount ?? 0) === 0 && (removed?.judgeCount ?? 0) === 0;

  return {
    message: parts.join(" "),
    refused: reachedNothing && (removed?.keptCount ?? 0) > 0,
  };
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
 * What the visibility dialog says once saved: the days left visible, by name,
 * or that the whole program is hidden.
 */
export function formatProgramVisibilityMessage(visibleDays: readonly string[]) {
  const days = [...new Set(visibleDays)].sort();

  if (days.length === 0) {
    return "Programa oculto.";
  }

  const named = formatSpanishList(
    days.map((day) => formatScheduleDayTabLabel(day).toLowerCase()),
  );

  return days.length === 1
    ? `Programa visible del ${named}.`
    : `Programa visible de los días ${named}.`;
}

/**
 * Where the row's name leads, if anywhere. A presentation opens on its panel —
 * who judges it and, once they have, what they gave — which links on to the
 * choreography; a choreography without a number has no presentation yet, so
 * its name is plain text.
 */
export function presentationRowPath(row: PresentationListItem) {
  if (row.presentationId === null) {
    return null;
  }

  return `/administracion/presentaciones/${row.presentationId}/puntajes`;
}
