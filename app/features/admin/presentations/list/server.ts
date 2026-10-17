import { experienceLevelRequirement } from "@/lib/choreographies/experience-level-requirement";
import { eq } from "drizzle-orm";
import { data, redirect } from "react-router";

import { db } from "@/db";
import { schedules } from "@/db/schema";

import {
  readListFacet,
  readListQuery,
  type ListQuerySpec,
} from "@/lib/list-query/list-query";
import { redirectToCanonicalListUrl } from "@/lib/list-query/list-query.server";
import { loadEventContext } from "@/lib/admin/event-context.server";
import { requireAdminPanelWriter } from "@/lib/auth/internal-access.server";
import { canWriteInAdminPanel } from "@/lib/auth/user-role.shared";
import {
  readVisibleProgramDays,
  setVisibleProgramDays,
} from "@/lib/presentations/program-visibility.server";
import { matchesPresentationSearch } from "@/lib/presentations/search";
import {
  assignJudges,
  readAssignableJudges,
  readAssignedJudges,
  removeJudges,
} from "@/lib/presentations/judge-assignments.server";
import {
  movePresentation,
  readFrozenChoreographyIds,
  readParticipationRows,
  runAutomaticOrdering,
  type ParticipationRow,
} from "@/lib/presentations/participation.server";
import {
  readPresentationEvaluationStatuses,
  type PresentationEvaluationStatus,
} from "@/lib/judging/evaluation-status.server";
import {
  derivePresentationWarnings,
  type PresentationWarning,
} from "@/lib/presentations/warnings";
import type { ChoreographyGroupType } from "@/lib/portal/choreographies";
import { readFormData } from "@/lib/shared/read-form-data";
import { readRequestedUrl } from "@/lib/shared/requested-url.server";
import { namedListDay, selectListDay } from "@/lib/shared/url-tab";

import { readMusicDownloadDays } from "../music-download/server";

import {
  automaticOrderingSchema,
  editJudgesIntent,
  formatAutomaticOrderingMessage,
  formatProgramVisibilityMessage,
  isPresentationStatusFilter,
  judgeEditSchema,
  judgeToAddFieldName,
  judgeToRemoveFieldName,
  movePresentationIntent,
  orderAutomaticallyIntent,
  orderDayFieldName,
  presentationStatusFilterParam,
  presentationChoreographyIdFieldName,
  programEventIdFieldName,
  programVisibilitySchema,
  programVisibleDayFieldName,
  readJudgeEditOutcome,
  readPresentationStatus,
  setProgramVisibilityIntent,
  type JudgeEditSubmissionValues,
  type PresentationListActionData,
  type PresentationListFilters,
  type PresentationListItem,
  type PresentationListResult,
  type PresentationOrder,
} from "./shared";

export type { PresentationListItem, PresentationListResult } from "./shared";

/**
 * The administrative participation list: what the page reads and the one
 * action it writes. The order itself belongs to `app/lib/presentations/`; this
 * module only narrows it to what the reader asked for and names the result.
 */

/** The running order is the only sort, and its column is called `orden` too. */
const presentationListSpec: ListQuerySpec<PresentationOrder["columnId"]> = {
  orderColumnIds: ["orden"],
  defaultOrder: { columnId: "orden", direction: "asc" },
};

export async function loadPresentationListRouteData(request: Request) {
  const user = await requireAdminPanelWriter(request);
  const eventContext = await loadEventContext(request);

  if (eventContext.redirectTo) {
    throw redirect(eventContext.redirectTo);
  }

  const result = await loadPresentationList({
    canWrite: canWriteInAdminPanel(user.role),
    filters: readPresentationFilters(readRequestedUrl(request).searchParams),
    selectedEventId: eventContext.selectedEventId,
  });

  redirectToCanonicalListUrl(request, {
    facets: {
      dia: namedListDay(result.days, result.filters.day),
      evaluacion: result.filters.evaluation,
      [presentationStatusFilterParam]: result.filters.status,
    },
    query: {
      order: result.filters.order,
      // Never paged: a page from a link made while it was is dropped.
      page: 1,
      search: result.filters.query,
    },
    spec: presentationListSpec,
  });

  return result;
}

async function loadPresentationList(input: {
  canWrite: boolean;
  filters: PresentationListFilters;
  selectedEventId: string | null;
}): Promise<PresentationListResult> {
  if (input.selectedEventId === null) {
    return {
      assignableJudges: [],
      assignedJudges: [],
      canWrite: input.canWrite,
      dayRowCount: 0,
      days: [],
      filters: input.filters,
      frozenDays: [],
      hasAnyRow: false,
      hasOrderableRow: false,
      orderableDays: [],
      hasPresentations: false,
      highestOrderNumber: 0,
      musicDownloadDays: [],
      presentations: [],
      programExportDays: [],
      programVisibleDays: [],
      selectedEventId: null,
      unorderedCount: 0,
      warnedCount: 0,
    };
  }

  const rows = await readParticipationRows(input.selectedEventId);
  const frozenChoreographyIds = await readFrozenChoreographyIds(rows);
  // The assignments of every row of the event, not only of the ones the
  // filters leave: the removal dialog offers the judges of the selection, and
  // the `Sin jueces` warning compares each presentation with the rest of its
  // schedule.
  const [
    assignableJudges,
    assigned,
    evaluationStatuses,
    musicDownloadDays,
    programVisibleDays,
  ] = await Promise.all([
    readAssignableJudges(),
    readAssignedJudges(rows.map((row) => row.choreographyId)),
    readPresentationEvaluationStatuses(rows.map((row) => row.choreographyId)),
    readMusicDownloadDays(input.selectedEventId),
    readVisibleProgramDays(input.selectedEventId),
  ]);
  const warnings = derivePresentationWarnings(rows, {
    assignedChoreographyIds: new Set(assigned.byChoreography.keys()),
    disqualifiedChoreographyIds: new Set(
      [...evaluationStatuses]
        .filter(([, status]) => status === "disqualified")
        .map(([choreographyId]) => choreographyId),
    ),
    frozenChoreographyIds,
  });
  const items = rows.map((row) =>
    buildPresentationListItem(row, {
      assignedJudgeIds: assigned.byChoreography,
      evaluationStatuses,
      frozenChoreographyIds,
      warnings,
    }),
  );
  // A choreography withdrawn before it had a number has no place in the order:
  // it makes no day tab and counts in no day until `Retirada` asks for it.
  const reachableItems =
    input.filters.status === "retirada"
      ? items
      : items.filter((item) => !isWithdrawnUnplaced(item));
  const days = [
    ...new Set(reachableItems.map((item) => item.scheduledDate)),
  ].sort();
  const filters = {
    ...input.filters,
    day: selectListDay(days, input.filters.day),
  };
  const dayItems = reachableItems.filter(
    (item) => item.scheduledDate === filters.day,
  );
  const filteredItems = sortPresentations(
    dayItems.filter((item) => matchesPresentationFilters(item, filters)),
    filters.order,
  );
  return {
    assignableJudges,
    assignedJudges: assigned.judges,
    canWrite: input.canWrite,
    dayRowCount: dayItems.length,
    days,
    filters,
    frozenDays: [
      ...new Set(
        items.filter((item) => item.frozen).map((item) => item.scheduledDate),
      ),
    ].sort(),
    hasAnyRow: items.length > 0,
    hasOrderableRow: items.some((item) => !item.withdrawn),
    orderableDays: [
      ...new Set(
        items
          .filter((item) => !item.withdrawn)
          .map((item) => item.scheduledDate),
      ),
    ].sort(),
    hasPresentations: items.some((item) => item.orderNumber !== null),
    highestOrderNumber: Math.max(
      0,
      ...items.map((item) => item.orderNumber ?? 0),
    ),
    musicDownloadDays,
    presentations: filteredItems,
    programExportDays: [
      ...new Set(
        items
          .filter((item) => item.orderNumber !== null)
          .map((item) => item.scheduledDate),
      ),
    ].sort(),
    programVisibleDays,
    selectedEventId: input.selectedEventId,
    // A withdrawn choreography never gets a number, so it is never late.
    unorderedCount: items.filter(
      (item) => item.orderNumber === null && !item.withdrawn,
    ).length,
    // The day on screen only: the notice's `Ver` narrows that day, so an
    // event-wide count could send the reader to an empty list. It counts the
    // rows `Con advertencias` keeps, the ones whose badge is a warning.
    warnedCount: dayItems.filter(
      (item) => readPresentationStatus(item) === "advertencias",
    ).length,
  };
}

/**
 * The one write of the list. It stays on the page: the table is rebuilt by the
 * loader's revalidation and the count travels in `actionData`, per
 * docs/agents/form-feedback.md.
 */
export async function handlePresentationListAction(
  request: Request,
): Promise<PresentationListActionData | ReturnType<typeof data>> {
  await requireAdminPanelWriter(request);
  const eventContext = await loadEventContext(request);
  const formData = await readFormData(request);
  const intent = formData.get("intent");

  if (!eventContext.selectedEventId) {
    return data(
      {
        message: "Elegí un evento activo para ordenar la presentación.",
        status: "error" as const,
      },
      { status: 400 },
    );
  }

  if (intent === movePresentationIntent) {
    return await runMovePresentation(eventContext.selectedEventId, formData);
  }

  if (intent === editJudgesIntent) {
    return await runJudgeEdit(formData);
  }

  if (intent === setProgramVisibilityIntent) {
    return await runProgramVisibility(eventContext.selectedEventId, formData);
  }

  if (intent !== orderAutomaticallyIntent) {
    return data(
      {
        message: "No se reconoció la acción solicitada.",
        status: "error" as const,
      },
      { status: 400 },
    );
  }

  return await runOrdering(eventContext.selectedEventId, formData);
}

/**
 * Orders the chosen days, or the whole event when the submission names none.
 * The dialog lists the event's own days, so a date outside them is a request
 * the form never made, refused like the visibility dialog refuses it.
 */
async function runOrdering(eventId: string, formData: FormData) {
  const parsed = automaticOrderingSchema.safeParse({
    [orderDayFieldName]: formData.getAll(orderDayFieldName),
  });
  const days = parsed.success ? parsed.data[orderDayFieldName] : null;

  if (days === null || !(await areEventDays(eventId, days))) {
    return data(
      {
        message: "No se reconocieron los días elegidos.",
        status: "error" as const,
      },
      { status: 400 },
    );
  }

  const result = await runAutomaticOrdering(eventId, days);

  if (!result.ok) {
    return data(
      {
        message: "No hay coreografías para ordenar.",
        status: "error" as const,
      },
      { status: 400 },
    );
  }

  return {
    message: formatAutomaticOrderingMessage(result),
    status: "success" as const,
  };
}

/**
 * Sets which days of the program the public page and the academies' portal
 * show. The submission is the whole set of visible days, so the days it leaves
 * out are hidden. The form carries the event it was shown for: one switched in
 * between is refused rather than having its program published unseen.
 */
async function runProgramVisibility(eventId: string, formData: FormData) {
  if (formData.get(programEventIdFieldName) !== eventId) {
    return data(
      {
        message:
          "El evento activo cambió mientras tanto: revisá su presentación antes de mostrar u ocultar el programa.",
        status: "error" as const,
      },
      { status: 409 },
    );
  }

  const parsed = programVisibilitySchema.safeParse({
    [programVisibleDayFieldName]: formData.getAll(programVisibleDayFieldName),
  });

  if (!parsed.success) {
    // The dialog only sends the days it lists, so this is a request the form
    // never made: a toast, not a field error.
    return data(
      {
        message: "No se reconocieron los días elegidos.",
        status: "error" as const,
      },
      { status: 400 },
    );
  }

  const days = parsed.data[programVisibleDayFieldName];

  // The dialog lists the event's own days, so a date outside them is a
  // request the form never made, and would publish nothing a schedule holds.
  if (!(await areEventDays(eventId, days))) {
    return data(
      {
        message: "No se reconocieron los días elegidos.",
        status: "error" as const,
      },
      { status: 400 },
    );
  }

  await setVisibleProgramDays(eventId, days);

  return {
    message: formatProgramVisibilityMessage(days),
    status: "success" as const,
  };
}

/** Whether every one of `days` is the date of one of the event's schedules. */
async function areEventDays(eventId: string, days: readonly string[]) {
  const eventDays = await db
    .selectDistinct({ scheduledDate: schedules.scheduledDate })
    .from(schedules)
    .where(eq(schedules.eventId, eventId));
  const knownDays = new Set(eventDays.map((row) => row.scheduledDate));

  return days.every((day) => knownDays.has(day));
}

/**
 * The judge dialog: the judges it adds to every chosen row, and the ones it
 * takes off every chosen row that has them. Each half answers with what it
 * reached and not with what was asked for: an already assigned pair is skipped
 * and a judge nobody in the selection has is a removal of nothing, so the
 * counts name presentations actually touched.
 *
 * The removal also reports the scored pairs it refused to take apart, and the
 * edit comes back an error when that is everything it reached.
 */
async function runJudgeEdit(formData: FormData) {
  const parsed = judgeEditSchema.safeParse({
    intent: editJudgesIntent,
    [presentationChoreographyIdFieldName]: formData.getAll(
      presentationChoreographyIdFieldName,
    ),
    [judgeToAddFieldName]: formData.getAll(judgeToAddFieldName),
    [judgeToRemoveFieldName]: formData.getAll(judgeToRemoveFieldName),
  });

  if (!parsed.success) {
    // The dialog holds the same schema, so a submission that gets this far is
    // a request the form never made: a toast, not a field error.
    return data(
      {
        message: "Elegí al menos una presentación y cambiá un juez.",
        status: "error" as const,
      },
      { status: 400 },
    );
  }

  const outcome = readJudgeEditOutcome(await applyJudgeEdit(parsed.data));

  if (outcome.refused) {
    return data(
      { message: outcome.message, status: "error" as const },
      { status: 409 },
    );
  }

  return { message: outcome.message, status: "success" as const };
}

/**
 * Each half of the edit that has judges to move, in one write: a removal that
 * fails takes the assignment back with it, so an edit lands whole or not at
 * all.
 */
async function applyJudgeEdit(edit: JudgeEditSubmissionValues) {
  const choreographyIds = edit[presentationChoreographyIdFieldName];
  const toAdd = edit[judgeToAddFieldName];
  const toRemove = edit[judgeToRemoveFieldName];

  return await db.transaction(async (tx) => ({
    assigned:
      toAdd.length > 0
        ? await assignJudges({ choreographyIds, judgeIds: toAdd }, tx)
        : null,
    removed:
      toRemove.length > 0
        ? await removeJudges({ choreographyIds, judgeIds: toRemove }, tx)
        : null,
  }));
}

/**
 * The move the drag and the number input both submit. `desde` is the number the
 * client believed the row had, `null` for a row it is placing for the first
 * time; a move that works answers with nothing to say.
 */
async function runMovePresentation(eventId: string, formData: FormData) {
  const choreographyId = String(formData.get("coreografia") ?? "");
  const from = formData.get("desde");
  const to = Number(formData.get("hasta"));

  if (choreographyId.length === 0 || !Number.isInteger(to) || to < 1) {
    return data(
      { message: "No se reconoció el movimiento.", status: "error" as const },
      { status: 400 },
    );
  }

  const result = await movePresentation({
    choreographyId,
    eventId,
    fromOrderNumber: from === null || from === "" ? null : Number(from),
    toOrderNumber: to,
  });

  if (result.ok) {
    return { status: "success" as const };
  }

  return data(
    {
      message: movePresentationRefusal(result.reason),
      status: "error" as const,
    },
    { status: 400 },
  );
}

function movePresentationRefusal(
  reason: Exclude<
    Awaited<ReturnType<typeof movePresentation>>,
    { ok: true }
  >["reason"],
) {
  switch (reason) {
    case "stale":
      return "El orden cambió mientras movías la fila; se actualizó la lista.";
    case "notOrdered":
      return "Ordená automáticamente el evento antes de mover una presentación.";
    case "notFound":
      return "La coreografía ya no forma parte de la lista de presentación.";
    case "frozenRow":
      return "Esa presentación está fija: su cronograma ya fue evaluado.";
    case "frozenPosition":
      return "Esa posición está fija: su cronograma ya fue evaluado.";
    case "withdrawnRow":
      return "Esa presentación está retirada: conserva su número.";
    case "withdrawnPosition":
      return "Esa posición es de una presentación retirada.";
  }
}

function readStatusFilter(value: string | null) {
  return isPresentationStatusFilter(value) ? value : null;
}

function readPresentationFilters(
  searchParams: URLSearchParams,
): PresentationListFilters {
  const listQuery = readListQuery(searchParams, presentationListSpec);

  return {
    day: readListFacet(searchParams, "dia"),
    evaluation:
      readListFacet(searchParams, "evaluacion") === "profesional"
        ? "profesional"
        : null,
    order: listQuery.order,
    query: listQuery.search,
    status: readStatusFilter(
      readListFacet(searchParams, presentationStatusFilterParam),
    ),
  };
}

function buildPresentationListItem(
  row: ParticipationRow,
  event: {
    assignedJudgeIds: Map<string, string[]>;
    evaluationStatuses: Map<string, PresentationEvaluationStatus>;
    frozenChoreographyIds: Set<string>;
    warnings: Map<string, PresentationWarning[]>;
  },
): PresentationListItem {
  return {
    academyName: row.academyName,
    assignedJudgeIds: event.assignedJudgeIds.get(row.choreographyId) ?? [],
    categoryName: row.category.name,
    choreographyNumber: row.choreographyNumber,
    evaluationStatus:
      event.evaluationStatuses.get(row.choreographyId) ?? "pending",
    experienceLevel: row.experienceLevel,
    experienceLevelRequirement: experienceLevelRequirement({
      categoryExperienceLevels: row.category.experienceLevels,
      groupType: row.groupType,
    }),
    financialStatus: row.financialStatus,
    frozen: event.frozenChoreographyIds.has(row.choreographyId),
    groupType: row.groupType as ChoreographyGroupType,
    id: row.choreographyId,
    modalityName: row.modalityName,
    name: row.name,
    orderNumber: row.orderNumber,
    presentationId: row.presentationId,
    professionalEvaluation: row.professionalEvaluation,
    scheduledDate: row.schedule.scheduledDate,
    submodalityName: row.submodalityName,
    warnings: event.warnings.get(row.choreographyId) ?? [],
    withdrawn: row.withdrawn,
  };
}

function isWithdrawnUnplaced(item: PresentationListItem) {
  return item.withdrawn && item.orderNumber === null;
}

function matchesPresentationFilters(
  item: PresentationListItem,
  filters: PresentationListFilters,
) {
  if (
    filters.status !== null &&
    readPresentationStatus(item) !== filters.status
  ) {
    return false;
  }

  if (filters.evaluation === "profesional" && !item.professionalEvaluation) {
    return false;
  }

  return matchesPresentationQuery(item, filters.query);
}

function matchesPresentationQuery(item: PresentationListItem, query: string) {
  return matchesPresentationSearch(query, item);
}

/**
 * The number is the only sort, and the rows without one always close the list:
 * they have no place in the order to be sorted into, in either direction.
 */
function sortPresentations(
  items: PresentationListItem[],
  order: PresentationOrder,
) {
  const factor = order.direction === "desc" ? -1 : 1;

  return [...items].sort((left, right) => {
    if (left.orderNumber === null || right.orderNumber === null) {
      if (left.orderNumber !== right.orderNumber) {
        return left.orderNumber === null ? 1 : -1;
      }

      return left.choreographyNumber - right.choreographyNumber;
    }

    return factor * (left.orderNumber - right.orderNumber);
  });
}
