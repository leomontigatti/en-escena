import { data, redirect } from "react-router";

import { normalizeSearchValue } from "@/components/shared/data-table-helpers";
import { loadEventContext } from "@/lib/admin/event-context.server";
import { requireInternalUser } from "@/lib/auth/internal-access.server";
import { formatEventSequenceNumber } from "@/lib/events/sequence-number";
import {
  readParticipationRows,
  runAutomaticOrdering,
  type ParticipationRow,
} from "@/lib/presentations/participation.server";
import {
  derivePresentationWarnings,
  type PresentationWarning,
} from "@/lib/presentations/warnings";
import type { ChoreographyGroupType } from "@/lib/portal/choreographies";
import type { ChoreographyFinancialStatus } from "@/lib/finances/inscription-financial-status";

/**
 * The administrative participation list: what the page reads and the one
 * action it writes. The order itself belongs to `app/lib/presentations/`; this
 * module only narrows it to what the reader asked for and names the result.
 */

const participationPageSize = 50;
export const orderAutomaticallyIntent = "order-automatically";

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

type PresentationOrder = {
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
  selectedEventId: string | null;
  totalCount: number;
  totalPages: number;
  unorderedCount: number;
  warnedCount: number;
};

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
      canOrder: input.canOrder,
      days: [],
      filters: input.filters,
      hasAnyRow: false,
      hasPresentations: false,
      presentations: [],
      selectedEventId: null,
      totalCount: 0,
      totalPages: 1,
      unorderedCount: 0,
      warnedCount: 0,
    };
  }

  const rows = await readParticipationRows(input.selectedEventId);
  const warnings = derivePresentationWarnings(rows);
  const items = rows.map((row) => buildPresentationListItem(row, warnings));
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
    canOrder: input.canOrder,
    days,
    filters: { ...filters, page },
    hasAnyRow: items.length > 0,
    hasPresentations: items.some((item) => item.orderNumber !== null),
    presentations: filteredItems.slice(
      (page - 1) * participationPageSize,
      page * participationPageSize,
    ),
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
export async function handlePresentationListAction(request: Request) {
  await requireInternalUser(request, ["admin"]);
  const eventContext = await loadEventContext(request);
  const formData = await request.formData();

  if (formData.get("intent") !== orderAutomaticallyIntent) {
    return data(
      {
        message: "No se reconoció la acción solicitada.",
        status: "error" as const,
      },
      { status: 400 },
    );
  }

  if (!eventContext.selectedEventId) {
    return data(
      {
        message: "Elegí un evento activo para ordenar la presentación.",
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
  warnings: Map<string, PresentationWarning[]>,
): PresentationListItem {
  return {
    academyName: row.academyName,
    categoryName: row.category.name,
    choreographyNumber: row.choreographyNumber,
    financialStatus: row.financialStatus,
    groupType: row.groupType as ChoreographyGroupType,
    id: row.choreographyId,
    modalityName: row.modalityName,
    name: row.name,
    orderNumber: row.orderNumber,
    scheduledDate: row.schedule.scheduledDate,
    submodalityName: row.submodalityName,
    warnings: warnings.get(row.choreographyId) ?? [],
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
