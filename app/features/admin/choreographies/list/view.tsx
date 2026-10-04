import { AudioLines, Clock, Settings, Users } from "lucide-react";

import {
  AdminEmptyState,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import {
  DataTableTruncatedText,
  ServerDataTable,
  type DataTableColumn,
  type DataTableFacetedFilter,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import { Badge } from "@/components/ui/badge";
import {
  getChoreographyStatusFilterBadgeVariant,
  resolveChoreographyStatusBadge,
  withdrawnChoreographyStatusFilterValue,
  withdrawnChoreographyStatusLabel,
} from "@/lib/choreographies/operational-status";
import { choreographyDetailPath } from "@/lib/choreographies/admin-paths";
import { formatEventSequenceNumber } from "@/lib/events/sequence-number";
import { formatGroupTypeLabel } from "@/lib/portal/choreographies";
import { formatPrimaryAndSecondaryValue } from "@/lib/shared/format-primary-and-secondary-value";
import { describeEmptyList } from "@/lib/list-query/list-query";
import { participationCountsExportPath } from "@/features/admin/choreographies/export/shared";
import { PeriodExportMenu } from "@/features/admin/period-export/menu";

import type { loadChoreographyListRouteData } from "./server";

type LoaderData = Awaited<ReturnType<typeof loadChoreographyListRouteData>>;
type ChoreographyRow = LoaderData["choreographies"][number];

type ChoreographiesListRouteViewProps = {
  loaderData: LoaderData;
};

const emptyChoreographyList = describeEmptyList(
  "coreografías",
  "search-and-filters",
);

/** How each `Estado` answer this list writes to the URL reads as a badge. */
const statusFilterAnswers: Record<
  string,
  "complete" | "incomplete" | "withdrawn"
> = {
  completa: "complete",
  incompleta: "incomplete",
  [withdrawnChoreographyStatusFilterValue]: "withdrawn",
};

const choreographyStatusFilterOptions = [
  { label: "Completa", value: "completa" },
  { label: "Incompleta", value: "incompleta" },
  // Last, after the two readiness answers: it is the other axis, and it is what
  // the withdrawn choreographies —hidden until it is picked— are reached by.
  {
    label: withdrawnChoreographyStatusLabel,
    value: withdrawnChoreographyStatusFilterValue,
  },
];

const choreographyGroupTypeFilterOptions = [
  { label: "Solo", value: "solo" },
  { label: "Dúo", value: "duo" },
  { label: "Trío", value: "trio" },
  { label: "Grupal", value: "grupal" },
];

const choreographyColumns: DataTableColumn<ChoreographyRow>[] = [
  {
    id: "numero",
    header: "#",
    width: 7,
    className: "font-medium tabular-nums",
    cell: (choreography) => (
      <DataTableLink to={choreographyDetailPath(choreography.id)}>
        {formatEventSequenceNumber(choreography.choreographyNumber)}
      </DataTableLink>
    ),
    filterValue: (choreography) =>
      formatEventSequenceNumber(choreography.choreographyNumber),
    sortValue: (choreography) => choreography.choreographyNumber,
  },
  {
    id: "nombre",
    header: "Nombre",
    width: 21,
    className: "font-medium",
    // The number is the row's only way into the detail. Linking the name too
    // gave one destination two targets, which reads as a choice and is not.
    cell: (choreography) => (
      <DataTableTruncatedText value={choreography.name} />
    ),
    filterValue: (choreography) => choreography.name,
    sortValue: (choreography) => choreography.name,
  },
  {
    id: "academia",
    header: "Academia",
    width: 21,
    className: "text-muted-foreground",
    cell: (choreography) => (
      <DataTableTruncatedText value={choreography.academyName} />
    ),
    filterValue: (choreography) => choreography.academyName,
    sortValue: (choreography) => choreography.academyName,
  },
  {
    id: "modalidadSubmodalidad",
    header: "Modalidad / Submodalidad",
    width: 21,
    className: "text-muted-foreground",
    cell: (choreography) => (
      <DataTableTruncatedText
        value={formatPrimaryAndSecondaryValue(
          choreography.modalityName,
          choreography.submodalityName,
        )}
      />
    ),
  },
  {
    id: "categoriaTipoGrupo",
    header: "Categoría / Tipo de grupo",
    width: 20,
    className: "text-muted-foreground",
    cell: (choreography) => (
      <DataTableTruncatedText
        value={formatPrimaryAndSecondaryValue(
          choreography.categoryName,
          formatGroupTypeLabel(choreography.groupType),
        )}
      />
    ),
  },
  {
    id: "estado",
    header: "Estado",
    width: 10,
    cell: (choreography) => (
      <ChoreographyStatusBadge choreography={choreography} />
    ),
  },
];

/**
 * `Retirada` **replaces** the readiness badge rather than sitting next to it: a
 * choreography that is not taking part is not half-loaded, it is out, and what
 * it still lacks is no longer anyone's task. Which of the two it is comes from
 * the shared resolver, so this cell and the portal's read the same way.
 */
function ChoreographyStatusBadge({
  choreography,
}: {
  choreography: ChoreographyRow;
}) {
  const badge = resolveChoreographyStatusBadge(choreography);

  return <Badge variant={badge.variant}>{badge.label}</Badge>;
}

export function ChoreographiesListRouteView({
  loaderData,
}: ChoreographiesListRouteViewProps) {
  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title="Coreografías"
      description="Revisá las coreografías registradas para el evento activo y su estado operativo."
      eventRequiredEmptyState={{
        title: "Elegí un evento activo para revisar coreografías",
        description:
          "Activá un evento para consultar las coreografías registradas por las academias.",
      }}
      headerAction={
        loaderData.canWrite ? undefined : (
          <PeriodExportMenu
            description="Cuántas academias, bailarines e inscripciones activas tuvo el evento activo en el período, por provincia y por modalidad. Dejá una fecha vacía para no acotar ese extremo."
            path={participationCountsExportPath}
            title="Exportar inscripciones"
          />
        )
      }
    >
      {hasChoreographyTableContent(loaderData) ? (
        <ChoreographyTable loaderData={loaderData} />
      ) : (
        <AdminEmptyState
          title={emptyChoreographyList.nothingYet}
          description="Cuando las academias registren coreografías para el evento activo, vas a poder revisarlas desde este listado."
        />
      )}
    </AdminResourceLayout>
  );
}

function ChoreographyTable({ loaderData }: { loaderData: LoaderData }) {
  return (
    <ServerDataTable
      rows={loaderData.choreographies}
      columns={choreographyColumns}
      getRowKey={(choreography) => choreography.id}
      // The widths above share the row out, so it cannot outgrow the page and
      // the list never asks the reader to scroll sideways.
      layout="fit"
      searchPlaceholder="Buscar por número, nombre o academia"
      initialSearchValue={loaderData.filters.query}
      facetedFilters={buildChoreographyFacetedFilters(loaderData)}
      initialFacetedFilterValues={buildChoreographyInitialFilters(loaderData)}
      initialSort={loaderData.filters.order}
      emptyMessage={emptyChoreographyList.nothingMatched}
      currentPage={loaderData.filters.page}
      totalPages={loaderData.totalPages}
      totalRows={loaderData.totalCount}
    />
  );
}

function hasChoreographyTableContent(loaderData: LoaderData) {
  return (
    loaderData.choreographies.length > 0 ||
    loaderData.hasAnyChoreography ||
    hasNarrowedChoreographyList(loaderData.filters)
  );
}

/**
 * Whether the reader narrowed this list rather than landed on it. An admin who
 * filtered their way to nothing is told nothing matched, and keeps the table to
 * undo it with; the empty state is for an event that has no choreographies yet.
 * The order and the page narrow nothing — a sort reorders the same rows, and a
 * page past the last one is clamped — so neither keeps the table up.
 */
function hasNarrowedChoreographyList(filters: LoaderData["filters"]) {
  return (
    filters.query.length > 0 ||
    filters.status !== null ||
    filters.modalityId !== null ||
    filters.category !== null ||
    filters.groupType !== null ||
    filters.scheduleDate !== null
  );
}

function buildChoreographyFacetedFilters(
  loaderData: LoaderData,
): DataTableFacetedFilter[] {
  return [
    {
      id: "estado",
      label: "Estado",
      options: choreographyStatusFilterOptions,
      renderValue: (option) => (
        <Badge
          variant={getChoreographyStatusFilterBadgeVariant(
            statusFilterAnswers[option.value] ?? "incomplete",
          )}
          className="font-normal"
        >
          {option.label}
        </Badge>
      ),
    },
    {
      id: "modalidad",
      icon: AudioLines,
      label: "Modalidad",
      options: loaderData.facets.modalities,
    },
    {
      id: "categoria",
      icon: Settings,
      label: "Categoría",
      options: loaderData.facets.categories,
    },
    {
      id: "tipo-grupo",
      icon: Users,
      label: "Tipo de grupo",
      options: choreographyGroupTypeFilterOptions,
    },
    {
      id: "dia",
      icon: Clock,
      label: "Día",
      options: loaderData.facets.scheduleDates,
    },
  ];
}

function buildChoreographyInitialFilters(loaderData: LoaderData) {
  const filters: Record<string, string> = {};

  if (loaderData.filters.status) {
    filters.estado = loaderData.filters.status;
  }

  if (loaderData.filters.modalityId) {
    filters.modalidad = loaderData.filters.modalityId;
  }

  if (loaderData.filters.category) {
    filters.categoria = loaderData.filters.category;
  }

  if (loaderData.filters.groupType) {
    filters["tipo-grupo"] = loaderData.filters.groupType;
  }

  if (loaderData.filters.scheduleDate) {
    filters.dia = loaderData.filters.scheduleDate;
  }

  return {
    filters,
  };
}
