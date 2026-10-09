import { PortalEmptyState, PortalListPage } from "@/components/portal/ui";
import { AwardBadge } from "@/components/shared/award-badge";
import {
  ClientDataTable,
  DataTableTruncatedText,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import {
  allDaysTabValue,
  ScheduleDayTabs,
  useScheduleDayTab,
} from "@/features/program/day-tabs";
import {
  formatProgramOrderNumber,
  listProgramDays,
} from "@/features/program/shared";
import { formatEventSequenceNumber } from "@/lib/events/sequence-number";
import { formatGroupTypeLabel } from "@/lib/portal/choreographies";
import { matchesPresentationSearch } from "@/lib/presentations/search";
import { formatPrimaryAndSecondaryValue } from "@/lib/shared/format-primary-and-secondary-value";

import type { PortalResultRow, PortalResultsLoaderData } from "./server";

/**
 * The administration's results list as the academy reads it: only its own
 * rows, only the published ones, and no academy column. On a phone each row is
 * a card (`ResultCard`).
 */
const resultsColumns: DataTableColumn<PortalResultRow>[] = [
  {
    id: "orden",
    header: "N.º",
    width: 8,
    className: "font-medium tabular-nums",
    cell: formatProgramOrderNumber,
    // The only sortable column: results are not a ranking.
    sortValue: (row) => row.orderNumber,
  },
  {
    id: "name",
    header: "Nombre",
    width: 20,
    className: "font-medium",
    cell: (row) => <ResultName row={row} />,
  },
  {
    id: "award",
    header: "Premio",
    width: 15,
    cell: (row) => (
      <AwardBadge award={row.award} disqualified={row.disqualified} />
    ),
  },
  {
    id: "average",
    header: "Promedio",
    width: 10,
    className: "tabular-nums",
    cell: formatAverage,
  },
  {
    id: "modality",
    header: "Modalidad / Submodalidad",
    width: 18,
    className: "text-muted-foreground",
    cell: (row) => (
      <DataTableTruncatedText
        value={formatPrimaryAndSecondaryValue(
          row.modalityName,
          row.submodalityName,
        )}
      />
    ),
  },
  {
    id: "categoryGroup",
    header: "Categoría / Tipo de grupo",
    width: 18,
    className: "text-muted-foreground",
    cell: (row) => (
      <DataTableTruncatedText
        value={formatPrimaryAndSecondaryValue(
          row.categoryName,
          formatGroupTypeLabel(row.groupType),
        )}
      />
    ),
  },
  {
    id: "experienceLevel",
    header: "Nivel",
    width: 11,
    className: "text-muted-foreground",
    cell: (row) => <DataTableTruncatedText value={row.levelLabel ?? "—"} />,
  },
];

export function PortalResultsListView({
  loaderData,
}: {
  loaderData: PortalResultsLoaderData;
}) {
  const emptyState = selectEmptyState(loaderData);

  return (
    <PortalListPage
      titleId="results-title"
      title="Resultados"
      description="Consultá el premio y el promedio de cada coreografía de tu academia en el evento activo."
    >
      {emptyState ? (
        <PortalEmptyState {...emptyState} />
      ) : (
        <ResultsList rows={loaderData.rows} />
      )}
    </PortalListPage>
  );
}

function ResultsList({ rows }: { rows: PortalResultRow[] }) {
  // As on the presentations page: the day narrows what is on screen, and is in
  // the URL so a reload or a shared link lands on it.
  const days = listProgramDays(rows);
  const tab = useScheduleDayTab(days);
  const visibleRows =
    tab.value === allDaysTabValue
      ? rows
      : rows.filter((row) => row.scheduledDate === tab.value);

  return (
    <div className="flex flex-col gap-3">
      <ScheduleDayTabs days={days} tab={tab} />

      <ClientDataTable
        rows={visibleRows}
        columns={resultsColumns}
        getRowKey={(row) => row.choreographyId}
        layout="fit"
        matchesSearch={(row, search) =>
          matchesPresentationSearch(search, {
            choreographyNumber: row.choreographyNumber,
            name: row.name,
            orderNumber: row.orderNumber,
          })
        }
        renderCard={(row) => <ResultCard row={row} />}
        searchPlaceholder="Buscar por número o nombre"
        initialSort={{ columnId: "orden", direction: "asc" }}
        emptyMessage="No hay resultados que coincidan con la búsqueda."
      />
    </div>
  );
}

/**
 * The name links to the evaluation; the choreography number, which no column
 * shows, travels in the truncation title.
 */
function ResultName({ row }: { row: PortalResultRow }) {
  return (
    <DataTableTruncatedText
      value={`${row.name} · ${formatEventSequenceNumber(row.choreographyNumber)}`}
    >
      <DataTableLink
        recordTitle
        to={`/portal/presentaciones/${row.choreographyId}`}
      >
        {row.name}
      </DataTableLink>
    </DataTableTruncatedText>
  );
}

/**
 * A row on a phone: the name and its number, what it competed in, and the
 * result last, so a scan down the cards ends each one on the award.
 */
function ResultCard({ row }: { row: PortalResultRow }) {
  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0 font-medium">
          <ResultName row={row} />
        </div>
        <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
          N.º {formatProgramOrderNumber(row) || "—"}
        </span>
      </div>
      <DataTableTruncatedText
        className="text-xs text-muted-foreground"
        value={[
          formatPrimaryAndSecondaryValue(row.modalityName, row.submodalityName),
          formatPrimaryAndSecondaryValue(
            row.categoryName,
            formatGroupTypeLabel(row.groupType),
          ),
          row.levelLabel,
        ]
          .filter(Boolean)
          .join(" · ")}
      />
      <div className="flex items-center justify-between gap-3">
        <AwardBadge award={row.award} disqualified={row.disqualified} />
        <span className="text-sm font-medium tabular-nums">
          {formatAverage(row)}
        </span>
      </div>
    </>
  );
}

/** The average reads the way scores do everywhere: with a point, as stored. */
function formatAverage(row: PortalResultRow) {
  return row.average === null ? "—" : String(row.average);
}

function selectEmptyState(loaderData: PortalResultsLoaderData) {
  if (!loaderData.hasActiveEvent) {
    return {
      title: "No hay un evento activo",
      description:
        "Cuando la organización active un evento vas a ver acá los resultados de tu academia.",
    };
  }

  if (!loaderData.areResultsPublished) {
    return {
      title: "Los resultados todavía no se publicaron",
      description:
        "Cuando la organización publique los resultados vas a ver acá el premio y el promedio de cada coreografía.",
    };
  }

  // Results are out, but none of this academy's presentations was evaluated
  // when they went out.
  if (loaderData.rows.length === 0) {
    return {
      title: "Tu academia no tiene resultados publicados",
      description:
        "Cuando la organización publique el resultado de una coreografía de tu academia, va a aparecer acá.",
    };
  }

  return null;
}
