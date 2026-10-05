import { Clock } from "lucide-react";

import {
  ClientDataTable,
  type DataTableColumn,
  type DataTableFacetedFiltersOf,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import { Badge } from "@/components/ui/badge";
import {
  formatAvailablePlacesSuffix,
  formatDate,
} from "@/features/admin/schedules/view-shared";
import type { SeminarListItem } from "@/lib/seminars/repository.server";
import {
  isSeminarKind,
  seminarKindLabels,
  seminarKindOptions,
  type SeminarKind,
} from "@/lib/seminars/seminar-kinds";
import { buildDetailPath } from "@/lib/shared/navigation";
import { cn } from "@/lib/shared/utils";
import { describeEmptyList } from "@/lib/list-query/list-query";

import { basePath } from "./shared";

const emptySeminarList = describeEmptyList("seminarios", "search-and-filters");

/** The URL parameter of each filter, which the route revalidates on. */
export const seminarFacetedFilterIds = ["tipo", "dia"] as const;

/** Kinds are not states, so both read neutral, told apart by fill. */
const seminarKindBadgeVariants = {
  regular: "outline",
  special: "secondary",
} as const satisfies Record<SeminarKind, "outline" | "secondary">;

export function SeminarList({
  linksToDetail,
  seminars,
  selectedEventId,
}: {
  /** False for the auditor, to whom the seminar's detail is closed. */
  linksToDetail: boolean;
  seminars: SeminarListItem[];
  selectedEventId: string | null;
}) {
  const columns: DataTableColumn<SeminarListItem>[] = [
    {
      id: "instructorName",
      header: "Instructor",
      className: "min-w-56 font-medium",
      cell: (seminar) =>
        linksToDetail ? (
          <DataTableLink
            to={buildDetailPath(basePath, seminar.id, selectedEventId)}
          >
            {seminar.instructorName}
          </DataTableLink>
        ) : (
          seminar.instructorName
        ),
      filterValue: (seminar) => seminar.instructorName,
    },
    {
      id: "scheduledDate",
      header: "Fecha",
      cell: (seminar) => formatDate(seminar.scheduledDate),
      className: "text-muted-foreground",
      sortValue: (seminar) => `${seminar.scheduledDate} ${seminar.startTime}`,
      filterValues: (seminar) => [seminar.scheduledDate],
    },
    {
      id: "startTime",
      header: "Hora",
      cell: (seminar) => seminar.startTime,
      className: "text-muted-foreground",
      sortValue: (seminar) => seminar.startTime,
    },
    {
      id: "quota",
      header: "Cupo",
      cell: (seminar) => (
        <SeminarQuota
          availablePlaces={seminar.availablePlaces}
          quota={seminar.quota}
        />
      ),
      className: "font-medium whitespace-nowrap",
    },
    {
      id: "kind",
      header: "Tipo",
      cell: (seminar) => <SeminarKindBadge kind={seminar.kind} />,
      filterValues: (seminar) => [seminar.kind],
    },
  ];

  return (
    <ClientDataTable
      rows={seminars}
      columns={columns}
      getRowKey={(seminar) => seminar.id}
      searchPlaceholder="Buscar por instructor"
      textFilterColumnId="instructorName"
      facetedFilters={buildSeminarFacetedFilters(seminars)}
      emptyMessage={emptySeminarList.nothingMatched}
      initialSort={{ columnId: "scheduledDate", direction: "asc" }}
    />
  );
}

function buildSeminarFacetedFilters(
  seminars: SeminarListItem[],
): DataTableFacetedFiltersOf<typeof seminarFacetedFilterIds> {
  const days = [...new Set(seminars.map((seminar) => seminar.scheduledDate))]
    .sort()
    .map((day) => ({ label: formatDate(day), value: day }));

  return [
    {
      id: "tipo",
      label: "Tipo",
      options: seminarKindOptions,
      renderValue: (option) =>
        isSeminarKind(option.value) ? (
          <SeminarKindBadge kind={option.value} />
        ) : (
          option.label
        ),
    },
    {
      id: "dia",
      icon: Clock,
      label: "Día",
      options: days,
    },
  ];
}

function SeminarKindBadge({ kind }: { kind: SeminarKind }) {
  return (
    <Badge variant={seminarKindBadgeVariants[kind]}>
      {seminarKindLabels[kind]}
    </Badge>
  );
}

/**
 * Same shape as the quota field in the form: the quota, then what is left of it
 * in muted read-only text. A full seminar reads destructive, so it is findable
 * while scanning the column.
 */
function SeminarQuota({
  availablePlaces,
  quota,
}: {
  availablePlaces: number;
  quota: number;
}) {
  return (
    <span>
      {quota}
      <span
        className={cn(
          "font-normal",
          availablePlaces === 0 ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {formatAvailablePlacesSuffix(availablePlaces)}
      </span>
    </span>
  );
}
