import { EyeOff, Trophy } from "lucide-react";
import { useState } from "react";

import {
  AdminEmptyState,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import { AlertStack } from "@/components/shared/alert-stack";
import { AwardBadge } from "@/components/shared/award-badge";
import {
  DataTableTruncatedText,
  ServerDataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DayExportDialog } from "@/features/admin/day-export/dialog";
import { resultsExportPath } from "@/features/admin/results/export/shared";
import {
  ScheduleDayTabs,
  useScheduleDayTab,
} from "@/features/program/day-tabs";
import { experienceLevelLabels } from "@/lib/events/experience-levels";
import { formatEventSequenceNumber } from "@/lib/events/sequence-number";
import { describeEmptyList } from "@/lib/list-query/list-query";
import { formatGroupTypeLabel } from "@/lib/portal/choreographies";
import { formatPrimaryAndSecondaryValue } from "@/lib/shared/format-primary-and-secondary-value";

import {
  ResultsPublicationAlert,
  ResultsPublicationDialog,
  type ResultsAction,
} from "./publication";
import {
  resultRowPath,
  type ResultsListItem,
  type ResultsListResult,
} from "./shared";

/**
 * The presentations list's columns without the ones that order it: the number
 * is read, not written, and the state badge gives way to the award and the
 * average.
 */
const resultsColumns: DataTableColumn<ResultsListItem>[] = [
  {
    id: "orden",
    header: "N.º",
    width: 8,
    className: "font-medium tabular-nums",
    cell: (row) => row.orderNumber,
    sortValue: (row) => row.orderNumber,
  },
  {
    id: "name",
    header: "Nombre",
    width: 13,
    className: "font-medium",
    // As on the presentations list, the choreography number travels in the
    // truncation title: it is not a column, but it stays searchable.
    cell: (row) => {
      const rowPath = resultRowPath(row);

      return (
        <DataTableTruncatedText
          value={`${row.name} · ${formatEventSequenceNumber(row.choreographyNumber)}`}
        >
          {rowPath ? (
            <DataTableLink recordTitle to={rowPath}>
              {row.name}
            </DataTableLink>
          ) : (
            row.name
          )}
        </DataTableTruncatedText>
      );
    },
  },
  {
    id: "academy",
    header: "Academia",
    width: 12,
    className: "text-muted-foreground",
    cell: (row) => <DataTableTruncatedText value={row.academyName} />,
  },
  {
    id: "modality",
    header: "Modalidad / Submodalidad",
    width: 20,
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
    width: 19,
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
    width: 7,
    className: "text-muted-foreground",
    cell: (row) => (
      <DataTableTruncatedText
        value={
          row.experienceLevel === null
            ? "—"
            : experienceLevelLabels[row.experienceLevel]
        }
      />
    ),
  },
  {
    id: "award",
    header: "Premio",
    width: 17,
    cell: (row) => <ResultAwardCell row={row} />,
  },
  {
    id: "average",
    header: "Promedio",
    width: 10,
    className: "tabular-nums",
    // The average reads the way scores do everywhere: with a point, as stored.
    cell: (row) => (row.average === null ? "—" : String(row.average)),
  },
];

/**
 * The award, or the disqualification in its place, and whether the academy
 * reads it yet. The mark only goes on a result the panel has reached: one still
 * waiting has nothing for anyone to read. It is an icon so the row keeps the
 * height every list shares.
 */
function ResultAwardCell({ row }: { row: ResultsListItem }) {
  if (row.evaluationStatus === "pending") {
    return "—";
  }

  return (
    <div className="flex items-center gap-1">
      <AwardBadge
        award={row.award}
        disqualified={row.evaluationStatus === "disqualified"}
      />
      {row.published ? null : (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge aria-label="Sin publicar" tabIndex={0} variant="outline">
              <EyeOff aria-hidden="true" />
            </Badge>
          </TooltipTrigger>
          <TooltipContent>Sin publicar</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

const emptyResultsList = describeEmptyList(
  "presentaciones",
  "search-and-filters",
);

export function ResultsListView({
  loaderData,
}: {
  loaderData: ResultsListResult;
}) {
  const [resultsAction, setResultsAction] = useState<ResultsAction | null>(
    null,
  );
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const tab = useScheduleDayTab(loaderData.days);

  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title="Resultados"
      description="Revisá el premio y el promedio de cada presentación del evento activo y publicalos para las academias."
      eventRequiredEmptyState={{
        title: "Elegí un evento activo para ver sus resultados",
        description:
          "Activá un evento para revisar y publicar los resultados de sus presentaciones.",
      }}
      headerAction={
        <ResultsListActions
          canExport={loaderData.canPublish && loaderData.exportDays.length > 0}
          canPublish={loaderData.canPublish}
          isPublished={loaderData.publication.publishedAt !== null}
          onExport={() => setIsExportDialogOpen(true)}
          onPublication={setResultsAction}
        />
      }
    >
      {loaderData.hasAnyRow ? (
        <TooltipProvider>
          <div className="flex flex-col gap-6">
            {loaderData.publication.publishedAt ? (
              <AlertStack>
                <ResultsPublicationAlert publication={loaderData.publication} />
              </AlertStack>
            ) : null}
            {/* `gap-3` and the tab row's `pb-1` add up to the 16px every list
              keeps between its tabs and its search. */}
            <div className="flex flex-col gap-3">
              <ScheduleDayTabs days={loaderData.days} tab={tab} />
              <ServerDataTable
                rows={loaderData.results}
                columns={resultsColumns}
                getRowKey={(row) => row.id}
                layout="fit"
                searchPlaceholder="Buscar por número, nombre o academia"
                initialSearchValue={loaderData.filters.query}
                initialSort={loaderData.filters.order}
                emptyMessage={emptyResultsList.nothingMatched}
                currentPage={loaderData.filters.page}
                totalPages={loaderData.totalPages}
                totalRows={loaderData.totalCount}
              />
            </div>
          </div>
        </TooltipProvider>
      ) : (
        <AdminEmptyState
          icon={Trophy}
          title={emptyResultsList.nothingYet}
          description="Una presentación entra en esta lista cuando recibe su número en el orden del evento activo."
        />
      )}
      {loaderData.canPublish && loaderData.selectedEventId ? (
        <ResultsPublicationDialog
          action={resultsAction}
          eventId={loaderData.selectedEventId}
          onClose={() => setResultsAction(null)}
          publication={loaderData.publication}
        />
      ) : null}
      {isExportDialogOpen ? (
        <DayExportDialog
          days={loaderData.exportDays}
          description="Elegí el día, o todos. Se descarga una planilla de Excel con el promedio y el premio de cada presentación evaluada."
          open
          onOpenChange={setIsExportDialogOpen}
          path={resultsExportPath}
          title="Descargar resultados"
        />
      ) : null}
    </AdminResourceLayout>
  );
}

/** The export first, then the publication; with neither there is no menu. */
function ResultsListActions({
  canExport,
  canPublish,
  isPublished,
  onExport,
  onPublication,
}: {
  canExport: boolean;
  canPublish: boolean;
  isPublished: boolean;
  onExport: () => void;
  onPublication: (action: ResultsAction) => void;
}) {
  if (!canExport && !canPublish) {
    return null;
  }

  return (
    <ResourceActionsMenu contentClassName="w-48">
      {canExport ? (
        <DropdownMenuItem onSelect={() => onExport()}>
          Descargar resultados
        </DropdownMenuItem>
      ) : null}
      {canExport && canPublish ? <DropdownMenuSeparator /> : null}
      {canPublish ? (
        <ResultsPublicationItems
          isPublished={isPublished}
          onSelect={onPublication}
        />
      ) : null}
    </ResourceActionsMenu>
  );
}

/**
 * The menu always matches the state: nothing to update or hide until results
 * are out, and nothing to show once they are. Each item only opens its
 * confirmation — the publishing itself is that dialog's form.
 */
function ResultsPublicationItems({
  isPublished,
  onSelect,
}: {
  isPublished: boolean;
  onSelect: (action: ResultsAction) => void;
}) {
  if (!isPublished) {
    return (
      <DropdownMenuItem onSelect={() => onSelect("show-results")}>
        Mostrar resultados
      </DropdownMenuItem>
    );
  }

  return (
    <>
      <DropdownMenuItem onSelect={() => onSelect("update-results")}>
        Actualizar resultados
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => onSelect("hide-results")}>
        Ocultar resultados
      </DropdownMenuItem>
    </>
  );
}
