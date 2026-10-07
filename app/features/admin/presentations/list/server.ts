import { eq } from "drizzle-orm";
import { data, redirect } from "react-router";

import { db } from "@/db";
import { schedules } from "@/db/schema";

import { adminListPageSize } from "@/lib/admin/admin-list";
import {
  paginateList,
  readListFacet,
  readListQuery,
  type ListQuerySpec,
} from "@/lib/list-query/list-query";
import { redirectToCanonicalListUrl } from "@/lib/list-query/list-query.server";
import { loadEventContext } from "@/lib/admin/event-context.server";
import { requireInternalUser } from "@/lib/auth/internal-access.server";
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

import { readMusicDownloadDays } from "../music-download/server";

import {
  assignJudgesIntent,
  formatAutomaticOrderingMessage,
  formatJudgeAssignmentMessage,
  formatProgramVisibilityMessage,
  judgeAssignmentSchema,
  judgeIdFieldName,
  movePresentationIntent,
  orderAutomaticallyIntent,
  presentationChoreographyIdFieldName,
  programEventIdFieldName,
  programVisibilitySchema,
  programVisibleDayFieldName,
  removeJudgesIntent,
  setProgramVisibilityIntent,
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
  const user = await requireInternalUser(request, ["admin"]);
  const eventContext = await loadEventContext(request);

  if (eventContext.redirectTo) {
    throw redirect(eventContext.redirectTo);
  }

  const result = await loadPresentationList({
    canOrder: user.role === "admin",
    filters: readPresentationFilters(new URL(request.url).searchParams),
    selectedEventId: eventContext.selectedEventId,
  });

  redirectToCanonicalListUrl(request, {
    facets: {
      dia: result.filters.day,
      evaluacion: result.filters.evaluation,
      advertencias: result.filters.warnings,
    },
    query: {
      order: result.filters.order,
      page: result.filters.page,
      search: result.filters.query,
    },
    spec: presentationListSpec,
  });

  return result;
}

async function loadPresentationList(input: {
  canOrder: boolean;
  filters: PresentationListFilters;
  selectedEventId: string | null;
}): Promise<PresentationListResult> {
  if (input.selectedEventId === null) {
    return {
      assignableJudges: [],
      assignedJudges: [],
      canOrder: input.canOrder,
      days: [],
      filters: input.filters,
      frozenCount: 0,
      hasAnyRow: false,
      hasPresentations: false,
      highestOrderNumber: 0,
      musicDownloadDays: [],
      presentations: [],
      programExportDays: [],
      programVisibleDays: [],
      selectedEventId: null,
      totalCount: 0,
      totalPages: 1,
      unorderedCount: 0,
      warnedCount: 0,
    };
  }

  const rows = await readParticipationRows(input.selectedEventId);
  const frozenChoreographyIds = await readFrozenChoreographyIds(rows);
  const warnings = derivePresentationWarnings(rows, frozenChoreographyIds);
  // The assignments of every row of the event, not only of the page: the
  // removal dialog offers the judges of the selection, and a selection is made
  // on one page at a time, so the page's rows are all it can ever need — but
  // the read is one query either way, and scoping it to the page would have to
  // wait for the page to be resolved.
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
  const items = rows.map((row) =>
    buildPresentationListItem(row, {
      assignedJudgeIds: assigned.byChoreography,
      evaluationStatuses,
      frozenChoreographyIds,
      warnings,
    }),
  );
  const days = [...new Set(items.map((item) => item.scheduledDate))].sort();
  const filters = {
    ...input.filters,
    day: days.includes(input.filters.day ?? "") ? input.filters.day : null,
  };
  const filteredItems = sortPresentations(
    items.filter((item) => matchesPresentationFilters(item, filters)),
    filters.order,
  );
  const { limit, offset, page, totalPages } = paginateList({
    page: filters.page,
    pageSize: adminListPageSize,
    totalCount: filteredItems.length,
  });

  return {
    assignableJudges,
    assignedJudges: assigned.judges,
    canOrder: input.canOrder,
    days,
    filters: { ...filters, page },
    frozenCount: frozenChoreographyIds.size,
    hasAnyRow: items.length > 0,
    hasPresentations: items.some((item) => item.orderNumber !== null),
    highestOrderNumber: Math.max(
      0,
      ...items.map((item) => item.orderNumber ?? 0),
    ),
    musicDownloadDays,
    presentations: filteredItems.slice(offset, offset + limit),
    programExportDays: [
      ...new Set(
        items
          .filter((item) => item.orderNumber !== null)
          .map((item) => item.scheduledDate),
      ),
    ].sort(),
    programVisibleDays,
    selectedEventId: input.selectedEventId,
    totalCount: filteredItems.length,
    totalPages,
    unorderedCount: items.filter((item) => item.orderNumber === null).length,
    warnedCount: items.filter((item) => item.warnings.length > 0).length,
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
  await requireInternalUser(request, ["admin"]);
  const eventContext = await loadEventContext(request);
  const formData = await request.formData();
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

  if (intent === assignJudgesIntent || intent === removeJudgesIntent) {
    return await runJudgeAssignment(intent, formData);
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

  const result = await runAutomaticOrdering(eventContext.selectedEventId);

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
  const eventDays = await db
    .selectDistinct({ scheduledDate: schedules.scheduledDate })
    .from(schedules)
    .where(eq(schedules.eventId, eventId));
  const knownDays = new Set(eventDays.map((row) => row.scheduledDate));

  if (days.some((day) => !knownDays.has(day))) {
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

/**
 * The two bulk dialogs, which differ only in which way the pair goes. Both
 * answer with what they reached and not with what was asked for: an already
 * assigned pair is skipped and a judge nobody in the selection has is a
 * removal of nothing, so the counts name presentations actually touched.
 *
 * A removal also reports the scored pairs it refused to take apart, and comes
 * back an error when that is everything it was asked about.
 */
async function runJudgeAssignment(
  intent: typeof assignJudgesIntent | typeof removeJudgesIntent,
  formData: FormData,
) {
  const parsed = judgeAssignmentSchema.safeParse({
    intent,
    [presentationChoreographyIdFieldName]: formData.getAll(
      presentationChoreographyIdFieldName,
    ),
    [judgeIdFieldName]: formData.getAll(judgeIdFieldName),
  });

  if (!parsed.success) {
    // The dialog holds the same schema, so a submission that gets this far is
    // a request the form never made: a toast, not a field error.
    return data(
      {
        message: "Elegí al menos una presentación y un juez.",
        status: "error" as const,
      },
      { status: 400 },
    );
  }

  const choreographyIds = parsed.data[presentationChoreographyIdFieldName];
  const judgeIds = parsed.data[judgeIdFieldName];

  const result =
    intent === assignJudgesIntent
      ? { ...(await assignJudges({ choreographyIds, judgeIds })), keptCount: 0 }
      : await removeJudges({ choreographyIds, judgeIds });
  const message = formatJudgeAssignmentMessage({
    intent,
    judgeCount: result.judgeCount,
    keptCount: result.keptCount,
    presentationCount: result.presentationCount,
  });

  // A removal that reached nothing because every chosen pair already has a
  // score is a refusal, not a quiet success: the message is all the
  // administrator gets, so it has to arrive in the tone of one.
  if (result.keptCount > 0 && result.judgeCount === 0) {
    return data({ message, status: "error" as const }, { status: 409 });
  }

  return { message, status: "success" as const };
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
  }
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
    page: listQuery.page,
    query: listQuery.search,
    warnings: searchParams.get("advertencias") === "con" ? "con" : null,
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
  };
}

function matchesPresentationFilters(
  item: PresentationListItem,
  filters: PresentationListFilters,
) {
  if (filters.day !== null && item.scheduledDate !== filters.day) {
    return false;
  }

  if (filters.warnings === "con" && item.warnings.length === 0) {
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
