import { ListOrdered, UserMinus, UserPlus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFetcher } from "react-router";

import {
  AdminEmptyState,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import {
  DataTableDragHandle,
  DataTableTruncatedText,
  ServerDataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import { FieldControlLockIcon } from "@/components/shared/field-lock-icon";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { Badge } from "@/components/ui/badge";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
import { experienceLevelLabels } from "@/lib/events/experience-levels";
import { formatEventSequenceNumber } from "@/lib/events/sequence-number";
import { formatGroupTypeLabel } from "@/lib/portal/choreographies";
import type { PresentationEvaluationStatus } from "@/lib/judging/evaluation-status.server";
import type { PresentationWarningKind } from "@/lib/presentations/warnings";
import { formatPrimaryAndSecondaryValue } from "@/lib/shared/format-primary-and-secondary-value";

import { showToastMessage } from "@/lib/shared/toasts";

import { JudgeAssignmentDialog } from "./judge-dialogs";
import {
  OrderingConfirmationDialog,
  PresentationDayTabs,
  PresentationNotices,
} from "./notices";
import {
  movePresentationIntent,
  presentationRowPath,
  type PresentationListActionData,
  type PresentationListItem,
  type PresentationListResult,
} from "./shared";

export type PresentationsListViewProps = {
  loaderData: PresentationListResult;
};

/**
 * The row's one badge, most relevant first. `Sin número` is a state and not a
 * warning, and it leads because a row without a number is not yet in the order
 * the rest of the triage talks about.
 */
const warningTriage: {
  kind: PresentationWarningKind;
  label: string;
}[] = [
  { kind: "belowDeposit", label: "Seña pendiente" },
  { kind: "evaluatedSchedule", label: "Cronograma evaluado" },
  { kind: "dancerSpacing", label: "Separación" },
  { kind: "outOfBlock", label: "Fuera de bloque" },
  { kind: "missingLevel", label: "Sin nivel" },
];

/**
 * What an evaluated row's badge says. It replaces the warning badge rather
 * than joining it: the warnings exist to be fixed before the presentation is
 * judged, so once it has been they have nothing left to ask for.
 */
const evaluationBadges: Record<
  Exclude<PresentationEvaluationStatus, "pending">,
  { label: string; variant: "destructive" | "success" }
> = {
  disqualified: { label: "Descalificada", variant: "destructive" },
  evaluated: { label: "Evaluada", variant: "success" },
};

/**
 * The list's columns. The number is a cell the administrator writes into, so
 * the moving seam is handed to the column list rather than read from a context
 * a plain `cell` callback could not reach.
 */
function buildPresentationColumns({
  moving,
}: {
  moving: PresentationMoving;
}): DataTableColumn<PresentationListItem>[] {
  return [
    ...(moving.canDrag
      ? [
          {
            id: "arrastrar",
            header: "",
            leading: true,
            // The weights started as the prototype's (#912), settled against
            // the 1152 px content width with real event data. The category and
            // modality columns were widened later: their headers did not fit.
            width: 3,
            className: "px-1",
            headerClassName: "px-1",
            // A frozen row has no grip: its schedule already ran, so there
            // is nowhere for it to go.
            cell: (row) =>
              row.frozen ? null : (
                <DataTableDragHandle label="Mover la presentación" />
              ),
          } satisfies DataTableColumn<PresentationListItem>,
        ]
      : []),
    {
      id: "orden",
      header: "N.º",
      width: 9,
      className: "font-medium tabular-nums",
      cell: (row) => <PresentationOrderCell moving={moving} row={row} />,
      sortValue: (row) => row.orderNumber ?? Number.MAX_SAFE_INTEGER,
    },
    {
      id: "categoriaTipoGrupo",
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
      id: "modalidadSubmodalidad",
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
      id: "academia",
      header: "Academia",
      width: 15,
      className: "text-muted-foreground",
      cell: (row) => <DataTableTruncatedText value={row.academyName} />,
    },
    {
      id: "nombre",
      header: "Nombre",
      width: 16,
      className: "font-medium",
      // The choreography number is not a column of this list, so it travels in
      // the truncation title: it stays searchable and the admin can still name
      // the choreography to the academy.
      cell: (row) => (
        <DataTableTruncatedText
          value={`${row.name} · ${formatEventSequenceNumber(row.choreographyNumber)}`}
        >
          <DataTableLink to={presentationRowPath(row)}>
            {row.name}
          </DataTableLink>
        </DataTableTruncatedText>
      ),
    },
    {
      id: "nivel",
      header: "Nivel",
      width: 8,
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
      id: "estado",
      header: "Estado",
      width: 11,
      cell: (row) => <PresentationStatusBadge row={row} />,
    },
  ];
}

/**
 * What the number cell and the drag handles need to place a row: whether the
 * administrator may move at all, and the one call that submits a move.
 */
type PresentationMoving = {
  canDrag: boolean;
  canMove: boolean;
  /** `null` before the event's first automatic ordering, when nothing moves. */
  highestNumber: number | null;
  move: (input: {
    choreographyId: string;
    fromOrderNumber: number | null;
    optimisticRowIds?: string[];
    toOrderNumber: number;
  }) => void;
};

/**
 * The move, optimistically. A drag reorders the rows on screen straight away
 * and the server answers with the refreshed list; a refusal drops the optimistic
 * order, which puts the row back, and says why. Nothing is said on success.
 */
function usePresentationMoving(loaderData: PresentationListResult) {
  const fetcher = useFetcher<PresentationListActionData>();
  const [optimisticRowIds, setOptimisticRowIds] = useState<string[] | null>(
    null,
  );
  const handledData = useRef<unknown>(null);

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) {
      return;
    }

    if (handledData.current === fetcher.data) {
      return;
    }

    handledData.current = fetcher.data;
    setOptimisticRowIds(null);

    if ("message" in fetcher.data) {
      showToastMessage({ message: fetcher.data.message, variant: "error" });
    }
  }, [fetcher.data, fetcher.state]);

  const isSortedByNumberAscending =
    loaderData.filters.order.columnId === "orden" &&
    loaderData.filters.order.direction === "asc";
  const canMove = loaderData.canOrder && loaderData.hasPresentations;

  const moving: PresentationMoving = {
    canDrag: canMove && isSortedByNumberAscending,
    canMove,
    highestNumber: loaderData.hasPresentations
      ? loaderData.highestOrderNumber
      : null,
    move: (input) => {
      setOptimisticRowIds(input.optimisticRowIds ?? null);
      void fetcher.submit(
        {
          coreografia: input.choreographyId,
          desde: input.fromOrderNumber === null ? "" : input.fromOrderNumber,
          hasta: input.toOrderNumber,
          intent: movePresentationIntent,
        },
        { method: "post" },
      );
    },
  };

  const rows = useMemo(() => {
    if (!optimisticRowIds) {
      return loaderData.presentations;
    }

    const byId = new Map(loaderData.presentations.map((row) => [row.id, row]));

    return optimisticRowIds
      .map((id) => byId.get(id))
      .filter((row): row is PresentationListItem => row !== undefined);
  }, [loaderData.presentations, optimisticRowIds]);

  return {
    isSortedByNumberAscending,
    moving,
    rows,
  };
}

/**
 * The number, always an input once the event has been ordered: typing one is
 * the way to place a row that dragging cannot reach, on another page or under
 * another sort. Before the first ordering there is no order to type into, and
 * a frozen row's number is not the administrator's to change, so both are
 * locked.
 */
function PresentationOrderCell({
  moving,
  row,
}: {
  moving: PresentationMoving;
  row: PresentationListItem;
}) {
  const current = row.orderNumber === null ? "" : String(row.orderNumber);
  const [value, setValue] = useState(current);
  const [lastKnown, setLastKnown] = useState(current);
  const [error, setError] = useState<string | null>(null);

  // The loader is the source of truth: a move, a re-ordering or another page
  // arriving resets what the cell shows.
  if (current !== lastKnown) {
    setLastKnown(current);
    setValue(current);
    setError(null);
  }

  if (!moving.canMove || moving.highestNumber === null || row.frozen) {
    return (
      <div className="relative">
        <Input
          aria-label={
            row.frozen
              ? `Número de presentación de ${row.name}`
              : "Número de presentación"
          }
          className="tabular-nums"
          disabled
          readOnly
          value={current}
        />
        <FieldControlLockIcon />
      </div>
    );
  }

  // A row already in the order can take any place in it; a late row is placed
  // by adding one to the end.
  const highest =
    row.orderNumber === null ? moving.highestNumber + 1 : moving.highestNumber;

  const commit = () => {
    const trimmed = value.trim();

    if (trimmed === current || (trimmed === "" && row.orderNumber === null)) {
      setError(null);
      return;
    }

    const parsed = Number(trimmed);

    if (!Number.isInteger(parsed) || parsed < 1 || parsed > highest) {
      setError(`Entre 1 y ${highest}`);
      return;
    }

    setError(null);
    moving.move({
      choreographyId: row.id,
      fromOrderNumber: row.orderNumber,
      toOrderNumber: parsed,
    });
  };

  return (
    <div className="flex flex-col gap-1">
      <Input
        aria-label={`Número de presentación de ${row.name}`}
        aria-invalid={error !== null || undefined}
        className="tabular-nums"
        inputMode="numeric"
        onBlur={commit}
        // A place in the order is a whole number, so anything but a digit is
        // dropped as it is typed rather than refused on commit.
        onChange={(event) => setValue(event.target.value.replace(/\D/g, ""))}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
        }}
        value={value}
      />
      <FieldError className="text-xs">{error}</FieldError>
    </div>
  );
}

export function PresentationsListView({
  loaderData,
}: PresentationsListViewProps) {
  const [isOrderingDialogOpen, setIsOrderingDialogOpen] = useState(false);
  const [judgeDialogMode, setJudgeDialogMode] = useState<
    "assign" | "remove" | null
  >(null);
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const { isSortedByNumberAscending, moving, rows } =
    usePresentationMoving(loaderData);
  const columns = buildPresentationColumns({ moving });
  // The selection lives on the page it was made on, so the rows it names are
  // read out of the page rather than out of the whole event.
  const selectedRows = rows.filter((row) => selectedRowIds.includes(row.id));

  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title="Presentación"
      description="Ordená las presentaciones del evento activo y asigná jueces."
      eventRequiredEmptyState={{
        title: "Elegí un evento activo para ordenar la presentación",
        description:
          "Activá un evento para numerar sus presentaciones y asignar jueces.",
      }}
      headerAction={
        loaderData.canOrder && loaderData.hasAnyRow ? (
          <ResourceActionsMenu>
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                setIsOrderingDialogOpen(true);
              }}
            >
              <ListOrdered aria-hidden="true" />
              Ordenar automáticamente
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={selectedRows.length === 0}
              onSelect={(event) => {
                event.preventDefault();
                setJudgeDialogMode("assign");
              }}
            >
              <UserPlus aria-hidden="true" />
              Asignar jueces
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={selectedRows.length === 0}
              onSelect={(event) => {
                event.preventDefault();
                setJudgeDialogMode("remove");
              }}
            >
              <UserMinus aria-hidden="true" />
              Quitar jueces
            </DropdownMenuItem>
          </ResourceActionsMenu>
        ) : undefined
      }
    >
      {loaderData.hasAnyRow ? (
        <TooltipProvider>
          <div className="flex flex-col gap-6">
            <PresentationNotices
              loaderData={loaderData}
              needsNumberSortToDrag={
                moving.canMove && !isSortedByNumberAscending
              }
              onOrderAutomatically={() => setIsOrderingDialogOpen(true)}
            />
            <PresentationDayTabs loaderData={loaderData} />
            <ServerDataTable
              rows={rows}
              columns={columns}
              reorder={{
                enabled: moving.canDrag,
                onMove: (activeRowId, overRowId) =>
                  moveDraggedRow({ activeRowId, moving, overRowId, rows }),
              }}
              getRowKey={(row) => row.id}
              layout="fit"
              selectableRows={loaderData.canOrder}
              // Only a numbered row can carry a judge: there is nothing to
              // hang the assignment off until the choreography has a
              // presentation.
              canSelectRow={(row) => row.orderNumber !== null}
              selectedRowIds={selectedRowIds}
              onSelectedRowIdsChange={setSelectedRowIds}
              searchPlaceholder="Buscar por número de coreografía, nombre o academia"
              initialSearchValue={loaderData.filters.query}
              initialSort={loaderData.filters.order}
              emptyMessage="No hay coreografías que coincidan con la búsqueda o los filtros."
              currentPage={loaderData.filters.page}
              totalPages={loaderData.totalPages}
              totalRows={loaderData.totalCount}
            />
          </div>
        </TooltipProvider>
      ) : (
        <AdminEmptyState
          icon={ListOrdered}
          title="Todavía no hay coreografías para ordenar."
          description="Una coreografía entra en esta lista cuando cubre su seña. Cuando haya alguna, vas a poder ordenarlas acá."
        />
      )}
      {loaderData.canOrder ? (
        <OrderingConfirmationDialog
          frozenCount={loaderData.frozenCount}
          open={isOrderingDialogOpen}
          onOpenChange={setIsOrderingDialogOpen}
        />
      ) : null}
      {loaderData.canOrder && judgeDialogMode !== null ? (
        <JudgeAssignmentDialog
          assignableJudges={loaderData.assignableJudges}
          assignedJudges={loaderData.assignedJudges}
          mode={judgeDialogMode}
          open
          onOpenChange={(next) => {
            if (!next) {
              setJudgeDialogMode(null);
            }
          }}
          selectedRows={selectedRows}
        />
      ) : null}
    </AdminResourceLayout>
  );
}

function PresentationStatusBadge({ row }: { row: PresentationListItem }) {
  if (row.orderNumber === null) {
    return <Badge variant="info">Sin número</Badge>;
  }

  if (row.evaluationStatus !== "pending") {
    const badge = evaluationBadges[row.evaluationStatus];

    // No count and no tooltip: the badge is the whole answer, and what the
    // panel gave is read in the scores view the row's name now leads to.
    return <Badge variant={badge.variant}>{badge.label}</Badge>;
  }

  const sorted = [...row.warnings].sort(
    (left, right) => triageRank(left.kind) - triageRank(right.kind),
  );
  const top = warningTriage.find((entry) => entry.kind === sorted[0]?.kind);

  if (!top) {
    return null;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="warning" tabIndex={0}>
          {top.label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-80">
        <ul className="flex flex-col gap-1">
          {sorted.map((warning, index) => (
            <li key={`${warning.kind}-${index}`}>{warning.message}</li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}

function triageRank(kind: PresentationWarningKind) {
  return warningTriage.findIndex((entry) => entry.kind === kind);
}

/**
 * A drag says "put this row where that one is", so the number it moves to is
 * the number of the row it was dropped on. The rows on screen are reordered the
 * same way, which is the optimistic answer the server then confirms.
 */
function moveDraggedRow({
  activeRowId,
  moving,
  overRowId,
  rows,
}: {
  activeRowId: string;
  moving: PresentationMoving;
  overRowId: string;
  rows: PresentationListItem[];
}) {
  const active = rows.find((row) => row.id === activeRowId);
  const over = rows.find((row) => row.id === overRowId);

  // Neither a frozen row nor a frozen place moves: the server would refuse
  // both, so the drop is ignored rather than shown and then undone.
  if (
    !active ||
    !over ||
    over.orderNumber === null ||
    active.frozen ||
    over.frozen
  ) {
    return;
  }

  const overIndex = rows.indexOf(over);
  const withoutActive = rows.filter((row) => row.id !== activeRowId);

  moving.move({
    choreographyId: active.id,
    fromOrderNumber: active.orderNumber,
    optimisticRowIds: [
      ...withoutActive.slice(0, overIndex).map((row) => row.id),
      active.id,
      ...withoutActive.slice(overIndex).map((row) => row.id),
    ],
    toOrderNumber: over.orderNumber,
  });
}
