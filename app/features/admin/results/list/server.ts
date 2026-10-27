import { experienceLevelRequirement } from "@/lib/choreographies/experience-level-requirement";
import { data, redirect } from "react-router";

import { adminListPageSize } from "@/lib/admin/admin-list";
import { loadEventContext } from "@/lib/admin/event-context.server";
import { requireAdminPanelWriter } from "@/lib/auth/internal-access.server";
import { canWriteInAdminPanel } from "@/lib/auth/user-role.shared";
import { readPresentationResults } from "@/lib/judging/presentation-results.server";
import { publishedResultsMessage } from "@/lib/judging/results-copy";
import {
  hideResults,
  publishResults,
  readResultsPublication,
} from "@/lib/judging/results.server";
import {
  paginateList,
  readListFacet,
  readListQuery,
  type ListQuerySpec,
} from "@/lib/list-query/list-query";
import { redirectToCanonicalListUrl } from "@/lib/list-query/list-query.server";
import { readParticipationRows } from "@/lib/presentations/participation.server";
import { matchesPresentationSearch } from "@/lib/presentations/search";
import type { ChoreographyGroupType } from "@/lib/portal/choreographies";
import { notificationToasts } from "@/lib/shared/notification-toasts";
import { readFormData } from "@/lib/shared/read-form-data";
import { readRequestedUrl } from "@/lib/shared/requested-url.server";
import { namedListDay, selectListDay } from "@/lib/shared/url-tab";

import {
  hideResultsIntent,
  publishResultsIntent,
  resultsEventIdFieldName,
  type ResultsListActionData,
  type ResultsListFilters,
  type ResultsListItem,
  type ResultsListResult,
  type ResultsOrder,
} from "./shared";

/**
 * The administrative results list: every numbered presentation of the active
 * event with its live average and award, and the publication of those results
 * to the academies. Nothing about a result is stored; see
 * `app/lib/judging/results.server.ts`.
 */

/** The running order, as on the presentations list, is the only sort. */
const resultsListSpec: ListQuerySpec<ResultsOrder["columnId"]> = {
  orderColumnIds: ["orden"],
  defaultOrder: { columnId: "orden", direction: "asc" },
};

export async function loadResultsListRouteData(request: Request) {
  const user = await requireAdminPanelWriter(request);
  const eventContext = await loadEventContext(request);

  if (eventContext.redirectTo) {
    throw redirect(eventContext.redirectTo);
  }

  const result = await loadResultsList({
    canWrite: canWriteInAdminPanel(user.role),
    filters: readResultsFilters(readRequestedUrl(request).searchParams),
    selectedEventId: eventContext.selectedEventId,
  });

  redirectToCanonicalListUrl(request, {
    facets: { dia: namedListDay(result.days, result.filters.day) },
    query: {
      order: result.filters.order,
      page: result.filters.page,
      search: result.filters.query,
    },
    spec: resultsListSpec,
  });

  return result;
}

async function loadResultsList(input: {
  canWrite: boolean;
  filters: ResultsListFilters;
  selectedEventId: string | null;
}): Promise<ResultsListResult> {
  if (input.selectedEventId === null) {
    return {
      canWrite: input.canWrite,
      days: [],
      filters: input.filters,
      hasAnyRow: false,
      exportDays: [],
      publication: { pendingCount: 0, publishedAt: null, publishedCount: 0 },
      results: [],
      selectedEventId: null,
      totalCount: 0,
      totalPages: 1,
    };
  }

  const allRows = await readParticipationRows(input.selectedEventId);
  // A choreography with no number has no presentation, so nothing to score;
  // a withdrawn one keeps its number but has no result, so it is absent.
  const [results, publication] = await Promise.all([
    readPresentationResults(
      { kind: "administration" },
      allRows.map((row) => row.choreographyId),
    ),
    readResultsPublication(input.selectedEventId),
  ]);
  const items = allRows.flatMap((row): ResultsListItem[] => {
    const entry = results.get(row.choreographyId);

    if (!entry || row.orderNumber === null || row.presentationId === null) {
      return [];
    }

    return [
      {
        academyName: row.academyName,
        categoryName: row.category.name,
        choreographyNumber: row.choreographyNumber,
        evaluated: entry.evaluated,
        experienceLevel: row.experienceLevel,
        experienceLevelRequirement: experienceLevelRequirement({
          categoryExperienceLevels: row.category.experienceLevels,
          groupType: row.groupType,
        }),
        groupType: row.groupType as ChoreographyGroupType,
        id: row.choreographyId,
        modalityName: row.modalityName,
        name: row.name,
        orderNumber: row.orderNumber,
        presentationId: row.presentationId,
        published: entry.published,
        result: entry.result,
        scheduledDate: row.schedule.scheduledDate,
        submodalityName: row.submodalityName,
      },
    ];
  });
  const days = [...new Set(items.map((item) => item.scheduledDate))].sort();
  const filters = {
    ...input.filters,
    day: selectListDay(days, input.filters.day),
  };
  const factor = filters.order.direction === "desc" ? -1 : 1;
  const filteredItems = items
    .filter(
      (item) =>
        item.scheduledDate === filters.day &&
        matchesPresentationSearch(filters.query, item),
    )
    .sort((left, right) => factor * (left.orderNumber - right.orderNumber));
  const { limit, offset, page, totalPages } = paginateList({
    page: filters.page,
    pageSize: adminListPageSize,
    totalCount: filteredItems.length,
  });

  return {
    canWrite: input.canWrite,
    days,
    filters: { ...filters, page },
    hasAnyRow: items.length > 0,
    // Only what has a result is exported, so a day with none is not offered.
    exportDays: [
      ...new Set(
        items
          .filter((item) => item.result.kind === "scored")
          .map((item) => item.scheduledDate),
      ),
    ].sort(),
    publication,
    results: filteredItems.slice(offset, offset + limit),
    selectedEventId: input.selectedEventId,
    totalCount: filteredItems.length,
    totalPages,
  };
}

/**
 * The publication, for the active event. It stays on the page: the alert and
 * the `Sin publicar` marks are rebuilt by the loader's revalidation and the
 * outcome travels in `actionData`, per docs/agents/form-feedback.md.
 */
export async function handleResultsListAction(
  request: Request,
): Promise<ResultsListActionData | ReturnType<typeof data>> {
  await requireAdminPanelWriter(request);
  const eventContext = await loadEventContext(request);
  const formData = await readFormData(request);
  const intent = formData.get("intent");

  if (!eventContext.selectedEventId) {
    return data(
      {
        message: "Elegí un evento activo para publicar sus resultados.",
        status: "error" as const,
      },
      { status: 400 },
    );
  }

  if (formData.get(resultsEventIdFieldName) !== eventContext.selectedEventId) {
    return data(
      {
        message:
          "El evento activo cambió mientras confirmabas: revisá sus resultados antes de publicarlos.",
        status: "error" as const,
      },
      { status: 409 },
    );
  }

  if (intent === publishResultsIntent) {
    return {
      message: publishedResultsMessage(
        await publishResults(eventContext.selectedEventId),
      ),
      status: "success",
    };
  }

  if (intent === hideResultsIntent) {
    await hideResults(eventContext.selectedEventId);

    return {
      message: notificationToasts["results-hidden"].message,
      status: "success",
    };
  }

  return data(
    {
      message: "No se reconoció la acción solicitada.",
      status: "error" as const,
    },
    { status: 400 },
  );
}

function readResultsFilters(searchParams: URLSearchParams): ResultsListFilters {
  const listQuery = readListQuery(searchParams, resultsListSpec);

  return {
    day: readListFacet(searchParams, "dia"),
    order: listQuery.order,
    page: listQuery.page,
    query: listQuery.search,
  };
}
