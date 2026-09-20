import { AlertTriangle, Info, ListOrdered } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFetcher, useSearchParams } from "react-router";

import {
  AdminEmptyState,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import { AlertStack } from "@/components/shared/alert-stack";
import {
  DataTableDragHandle,
  DataTableTruncatedText,
  ServerDataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import { FieldControlLockIcon } from "@/components/shared/field-lock-icon";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatScheduleDayLabel } from "@/lib/choreographies/schedule-formatters";
import { formatEventSequenceNumber } from "@/lib/events/sequence-number";
import { formatGroupTypeLabel } from "@/lib/portal/choreographies";
import type { PresentationWarningKind } from "@/lib/presentations/warnings";
import { formatPrimaryAndSecondaryValue } from "@/lib/shared/format-primary-and-secondary-value";

import { showToastMessage } from "@/lib/shared/toasts";

import {
  movePresentationIntent,
  orderAutomaticallyIntent,
  type PresentationListActionData,
  type PresentationListItem,
  type PresentationListResult,
} from "./server";

export type PresentationsListViewProps = {
  loaderData: PresentationListResult;
};

const allDaysTabValue = "todos";

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
  { kind: "dancerSpacing", label: "Separación" },
  { kind: "outOfBlock", label: "Fuera de bloque" },
];

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
            width: 4,
            className: "px-1",
            headerClassName: "px-1",
            cell: () => <DataTableDragHandle label="Mover la presentación" />,
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
      width: 16,
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
      id: "academia",
      header: "Academia",
      width: 19,
      className: "text-muted-foreground",
      cell: (row) => <DataTableTruncatedText value={row.academyName} />,
    },
    {
      id: "nombre",
      header: "Nombre",
      width: 22,
      className: "font-medium",
      // The choreography number is not a column of this list, so it travels in
      // the truncation title: it stays searchable and the admin can still name
      // the choreography to the academy.
      cell: (row) => (
        <DataTableTruncatedText
          value={`${row.name} · ${formatEventSequenceNumber(row.choreographyNumber)}`}
        >
          <DataTableLink to={`/administracion/coreografias/${row.id}`}>
            {row.name}
          </DataTableLink>
        </DataTableTruncatedText>
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
      ? loaderData.presentationCount
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
 * another sort. Before the first ordering there is no order to type into, so
 * the number is locked.
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

  if (!moving.canMove || moving.highestNumber === null) {
    return (
      <div className="relative">
        <Input
          aria-label="Número de presentación"
          className="h-8 tabular-nums"
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
        className="h-8 tabular-nums"
        inputMode="numeric"
        onBlur={commit}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
        }}
        value={value}
      />
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </div>
  );
}

export function PresentationsListView({
  loaderData,
}: PresentationsListViewProps) {
  const [isOrderingDialogOpen, setIsOrderingDialogOpen] = useState(false);
  const { isSortedByNumberAscending, moving, rows } =
    usePresentationMoving(loaderData);
  const columns = buildPresentationColumns({ moving });

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
          open={isOrderingDialogOpen}
          onOpenChange={setIsOrderingDialogOpen}
        />
      ) : null}
    </AdminResourceLayout>
  );
}

function PresentationStatusBadge({ row }: { row: PresentationListItem }) {
  if (row.orderNumber === null) {
    return <Badge variant="info">Sin número</Badge>;
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

  if (!active || !over || over.orderNumber === null) {
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
    ].slice(0, rows.length),
    toOrderNumber: over.orderNumber,
  });
}

function PresentationNotices({
  loaderData,
  needsNumberSortToDrag,
  onOrderAutomatically,
}: {
  loaderData: PresentationListResult;
  needsNumberSortToDrag: boolean;
  onOrderAutomatically: () => void;
}) {
  return (
    <AlertStack>
      {loaderData.hasPresentations ? null : (
        <Alert variant="info">
          <Info aria-hidden="true" />
          <AlertDescription>
            Las coreografías todavía no tienen un número de presentación
            asignado.
          </AlertDescription>
          {loaderData.canOrder ? (
            <AlertAction className="top-1/2 -translate-y-1/2">
              <Button
                type="button"
                size="sm"
                variant="link"
                onClick={onOrderAutomatically}
              >
                <ListOrdered aria-hidden="true" data-icon="inline-start" />
                Ordenar automáticamente
              </Button>
            </AlertAction>
          ) : null}
        </Alert>
      )}
      {loaderData.hasPresentations && loaderData.unorderedCount > 0 ? (
        <Alert variant="info">
          <Info aria-hidden="true" />
          <AlertDescription>
            {loaderData.unorderedCount === 1
              ? "Existe 1 coreografía sin número de presentación."
              : `Existen ${loaderData.unorderedCount} coreografías sin número de presentación.`}
          </AlertDescription>
        </Alert>
      ) : null}
      {needsNumberSortToDrag ? (
        <Alert variant="info">
          <Info aria-hidden="true" />
          <AlertDescription>Ordená por número para arrastrar.</AlertDescription>
        </Alert>
      ) : null}
      {loaderData.warnedCount > 0 ? (
        <PresentationWarningsNotice loaderData={loaderData} />
      ) : null}
    </AlertStack>
  );
}

/** The warnings count, and the filter that narrows the list down to them. */
function PresentationWarningsNotice({
  loaderData,
}: {
  loaderData: PresentationListResult;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const isFilteredToWarnings = loaderData.filters.warnings === "con";

  const toggleWarningFilter = () => {
    const next = new URLSearchParams(searchParams);

    if (isFilteredToWarnings) {
      next.delete("advertencias");
    } else {
      next.set("advertencias", "con");
    }

    next.delete("pagina");
    setSearchParams(next);
  };

  return (
    <Alert variant="warning">
      <AlertTriangle aria-hidden="true" />
      <AlertDescription>
        {loaderData.warnedCount === 1
          ? "Existe 1 presentación con advertencias."
          : `Existen ${loaderData.warnedCount} presentaciones con advertencias.`}
      </AlertDescription>
      <AlertAction className="top-1/2 -translate-y-1/2">
        <Button
          type="button"
          size="sm"
          variant="link"
          onClick={toggleWarningFilter}
        >
          {isFilteredToWarnings ? "Ver todas" : "Ver"}
        </Button>
      </AlertAction>
    </Alert>
  );
}

function PresentationDayTabs({
  loaderData,
}: {
  loaderData: PresentationListResult;
}) {
  const [searchParams, setSearchParams] = useSearchParams();

  const selectDay = (day: string) => {
    const next = new URLSearchParams(searchParams);

    if (day === allDaysTabValue) {
      next.delete("dia");
    } else {
      next.set("dia", day);
    }

    next.delete("pagina");
    setSearchParams(next);
  };

  return (
    <Tabs value={loaderData.filters.day ?? allDaysTabValue}>
      <TabsList variant="line">
        <TabsTrigger
          value={allDaysTabValue}
          onClick={() => selectDay(allDaysTabValue)}
        >
          Todos
        </TabsTrigger>
        {loaderData.days.map((day) => (
          <TabsTrigger key={day} value={day} onClick={() => selectDay(day)}>
            {formatScheduleDayLabel(day)}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

/**
 * On the `delete-dialog.tsx` shape: the description, one always-shown
 * destructive alert and the confirmation. The action is never disabled by the
 * data — what cannot be ordered is answered by the server, not by the menu.
 */
function OrderingConfirmationDialog({
  onOpenChange,
  open,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        className="max-h-[calc(100dvh-2rem)]"
        onEscapeKeyDown={(event) => {
          event.preventDefault();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Ordenar automáticamente</AlertDialogTitle>
          <AlertDialogDescription>
            Las coreografías elegibles se ordenan por defecto y se les asigna un
            número de presentación nuevo.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Alert variant="destructive">
          <AlertTriangle aria-hidden="true" />
          <AlertDescription>
            Esta acción es irreversible y modifica cualquier orden manual
            realizado.
          </AlertDescription>
        </Alert>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <form method="post">
            <input
              type="hidden"
              name="intent"
              value={orderAutomaticallyIntent}
            />
            <Button type="submit">Ordenar</Button>
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
