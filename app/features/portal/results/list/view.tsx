import { PortalEmptyState, PortalListPage } from "@/components/portal/ui";
import { AwardBadge } from "@/components/shared/award-badge";
import {
  ClientDataTable,
  DataTableTruncatedText,
  type DataTableColumn,
} from "@/components/shared/data-table";
import {
  allDaysTabValue,
  ScheduleDayTabs,
  useScheduleDayTab,
} from "@/features/program/day-tabs";
import {
  formatProgramOrderNumber,
  listProgramDays,
} from "@/features/program/shared";
import { ProgramRowCard, ProgramRowName } from "@/features/program/row-card";
import { formatGroupTypeLabel } from "@/lib/portal/choreographies";
import { matchesPresentationSearch } from "@/lib/presentations/search";
import { formatPrimaryAndSecondaryValue } from "@/lib/shared/format-primary-and-secondary-value";

import type { PortalResultRow, PortalResultsLoaderData } from "./server";

/**
 * The administration's results list as the academy reads it: only its own
 * rows, only the published ones, and no academy column. On a phone each row is
 * a card (`PortalResultCard`).
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
    cell: (row) => <ProgramRowName row={row} to={evaluationPath(row)} />,
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
        <PortalResultsList rows={loaderData.rows} />
      )}
    </PortalListPage>
  );
}

function PortalResultsList({ rows }: { rows: PortalResultRow[] }) {
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
        renderCard={(row) => <PortalResultCard row={row} />}
        searchPlaceholder="Buscar por número o nombre"
        initialSort={{ columnId: "orden", direction: "asc" }}
        emptyMessage="No hay resultados que coincidan con la búsqueda."
      />
    </div>
  );
}

/** A row's name opens what the judges said about it. */
function evaluationPath(row: PortalResultRow) {
  return `/portal/presentaciones/${row.choreographyId}`;
}

/**
 * A row on a phone ends on the result, so a scan down the cards ends each one
 * on the award.
 */
function PortalResultCard({ row }: { row: PortalResultRow }) {
  return (
    <ProgramRowCard row={row} showLevel to={evaluationPath(row)}>
      <div className="flex items-center justify-between gap-3">
        <AwardBadge award={row.award} disqualified={row.disqualified} />
        <span className="text-sm font-medium tabular-nums">
          {formatAverage(row)}
        </span>
      </div>
    </ProgramRowCard>
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
