import { data, redirect } from "react-router";

import { normalizeSearchValue } from "@/components/shared/data-table-helpers";
import { loadEventContext } from "@/lib/admin/event-context.server";
import { requireInternalUser } from "@/lib/auth/internal-access.server";
import { formatEventSequenceNumber } from "@/lib/events/sequence-number";
import {
  assignJudges,
  readAssignableJudges,
  readAssignedJudges,
  removeJudges,
} from "@/lib/presentations/judge-assignments.server";
import {
  movePresentation,
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

import {
  assignJudgesIntent,
  formatJudgeAssignmentMessage,
  judgeAssignmentSchema,
  judgeIdFieldName,
  movePresentationIntent,
  orderAutomaticallyIntent,
  presentationChoreographyIdFieldName,
  removeJudgesIntent,
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

const participationPageSize = 50;
const defaultPresentationOrder: PresentationOrder = {
  columnId: "orden",
  direction: "asc",
};

export async function loadPresentationListRouteData(request: Request) {
  const user = await requireInternalUser(request, ["admin", "auditor"]);
  const eventContext = await loadEventContext(request);

  if (eventContext.redirectTo) {
    throw redirect(eventContext.redirectTo);
  }

  const url = new URL(request.url);

  return await loadPresentationList({
    canOrder: user.role === "admin",
    filters: readPresentationFilters(url.searchParams),
    selectedEventId: eventContext.selectedEventId,
  });
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
      hasAnyRow: false,
      hasPresentations: false,
      presentations: [],
      presentationCount: 0,
      selectedEventId: null,
      totalCount: 0,
      totalPages: 1,
      unorderedCount: 0,
      warnedCount: 0,
    };
  }

  const rows = await readParticipationRows(input.selectedEventId);
  const warnings = derivePresentationWarnings(rows);
  // The assignments of every row of the event, not only of the page: the
  // removal dialog offers the judges of the selection, and a selection is made
  // on one page at a time, so the page's rows are all it can ever need — but
  // the read is one query either way, and scoping it to the page would have to
  // wait for the page to be resolved.
  const [assignableJudges, assigned, evaluationStatuses] = await Promise.all([
    readAssignableJudges(),
    readAssignedJudges(rows.map((row) => row.choreographyId)),
    readPresentationEvaluationStatuses(rows.map((row) => row.choreographyId)),
  ]);
  const items = rows.map((row) =>
    buildPresentationListItem(row, {
      assignedJudgeIds: assigned.byChoreography,
      evaluationStatuses,
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
  const totalCount = filteredItems.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / participationPageSize));
  const page = Math.min(filters.page, totalPages);

  return {
    assignableJudges,
    assignedJudges: assigned.judges,
    canOrder: input.canOrder,
    days,
    filters: { ...filters, page },
    hasAnyRow: items.length > 0,
    hasPresentations: items.some((item) => item.orderNumber !== null),
    presentations: filteredItems.slice(
      (page - 1) * participationPageSize,
      page * participationPageSize,
    ),
    presentationCount: items.filter((item) => item.orderNumber !== null).length,
    selectedEventId: input.selectedEventId,
    totalCount,
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
        message:
          result.reason === "evaluated"
            ? "No se puede ordenar: hay presentaciones que ya fueron evaluadas."
            : "No hay coreografías para ordenar.",
        status: "error" as const,
      },
      { status: 400 },
    );
  }

  return {
    message: `Se ordenaron ${result.orderedCount} presentaciones.`,
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
    return { status: "moved" as const };
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
  }
}

function readPresentationFilters(
  searchParams: URLSearchParams,
): PresentationListFilters {
  return {
    day: readNonEmptySearchParam(searchParams.get("dia")),
    order: readPresentationOrder(searchParams.get("orden")),
    page: readPage(searchParams),
    query: searchParams.get("busqueda")?.trim() ?? "",
    warnings: searchParams.get("advertencias") === "con" ? "con" : null,
  };
}

function buildPresentationListItem(
  row: ParticipationRow,
  event: {
    assignedJudgeIds: Map<string, string[]>;
    evaluationStatuses: Map<string, PresentationEvaluationStatus>;
    warnings: Map<string, PresentationWarning[]>;
  },
): PresentationListItem {
  return {
    academyName: row.academyName,
    assignedJudgeIds: event.assignedJudgeIds.get(row.choreographyId) ?? [],
    categoryName: row.category.name,
    choreographyNumber: row.choreographyNumber,
    evaluationStatus:
      event.evaluationStatuses.get(row.choreographyId) ?? "pendiente",
    experienceLevel: row.experienceLevel,
    financialStatus: row.financialStatus,
    groupType: row.groupType as ChoreographyGroupType,
    id: row.choreographyId,
    modalityName: row.modalityName,
    name: row.name,
    orderNumber: row.orderNumber,
    presentationId: row.presentationId,
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

  return matchesPresentationQuery(item, filters.query);
}

function matchesPresentationQuery(item: PresentationListItem, query: string) {
  if (query.length === 0) {
    return true;
  }

  const normalizedQuery = normalizeSearchValue(query);

  return (
    normalizeSearchValue(item.name).includes(normalizedQuery) ||
    normalizeSearchValue(item.academyName).includes(normalizedQuery) ||
    formatEventSequenceNumber(item.choreographyNumber).includes(normalizedQuery)
  );
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

function readPresentationOrder(value: string | null): PresentationOrder {
  return value === "orden:desc"
    ? { columnId: "orden", direction: "desc" }
    : defaultPresentationOrder;
}

function readPage(searchParams: URLSearchParams) {
  const value = Number(searchParams.get("pagina"));

  return Number.isInteger(value) && value > 0 ? value : 1;
}

function readNonEmptySearchParam(value: string | null) {
  return value?.trim().length ? value.trim() : null;
}
