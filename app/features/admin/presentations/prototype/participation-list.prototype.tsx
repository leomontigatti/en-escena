// PROTOTYPE — throwaway, lives only on branch `prototype/912-participation-list`
// (wayfinder ticket #912, map #907). The admin participation list in three
// variants, on the shared `ServerDataTable` with three branch-only seams
// (`canSelectRow`, `reorder`, `getRowGroup`). Every write lands in memory.
import { Check, ListOrdered, UserMinus } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";

import {
  AdminEmptyState,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import {
  ServerDataTable,
  type DataTableFacetedFilter,
} from "@/components/shared/data-table";
import { MetricCard } from "@/components/shared/metric-card";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { Button } from "@/components/ui/button";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import { formatEventSequenceNumber } from "@/lib/events/sequence-number";
import { showToastMessage } from "@/lib/shared/toasts";

import { buildColumns } from "./participation-columns.prototype";
import {
  formatCount,
  JudgesDialog,
  OrderingDialog,
} from "./participation-dialogs.prototype";
import {
  buildCaseRows,
  derivePresentationWarnings,
  formatScheduleLabel,
  judges,
  movePresentation,
  runAutomaticOrdering,
  schedules,
  type ParticipationRow,
  type PrototypeCaseId,
} from "./participation-fixtures.prototype";
import { ListNotices, PrototypeState } from "./participation-notices.prototype";

export const participationVariants = {
  A: "Pestaña dentro de Coreografías, cronograma como columna",
  B: "Página propia con cifras, cronograma como encabezado de grupo",
  C: "Página propia, pestañas por cronograma, advertencias como filtro",
} as const;

export type ParticipationVariant = keyof typeof participationVariants;

export type ParticipationQuery = {
  onlyWarnings: boolean;
  page: number;
  scheduleTab: string;
  search: string;
  sort: { columnId: string; direction: "asc" | "desc" } | null;
};

const pageSize = 50;

const warningsFacetedFilters: DataTableFacetedFilter[] = [
  {
    id: "advertencias",
    label: "Advertencias",
    options: [{ label: "Con advertencias", value: "con" }],
  },
];

export function ParticipationListPrototype({
  caseId,
  conflict,
  onToggleOnlyWarnings,
  query,
  setScheduleTab,
  variant,
}: {
  caseId: PrototypeCaseId;
  conflict: boolean;
  onToggleOnlyWarnings: () => void;
  query: ParticipationQuery;
  setScheduleTab: (tab: string) => void;
  variant: ParticipationVariant;
}) {
  const navigate = useNavigate();
  const [rows, setRows] = useState(() => buildCaseRows(caseId));
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [dialog, setDialog] = useState<"ordering" | "assign" | "remove" | null>(
    null,
  );
  const [log, setLog] = useState<string[]>([]);
  const record = (entry: string) =>
    setLog((current) => [entry, ...current].slice(0, 6));

  const warnings = useMemo(() => derivePresentationWarnings(rows), [rows]);
  const eligibleCount = rows.filter((row) => !row.isBelowDeposit).length;
  const presentationCount = rows.filter(
    (row) => row.orderNumber !== null,
  ).length;
  const unorderedCount = rows.filter(
    (row) => row.orderNumber === null && !row.isBelowDeposit,
  ).length;
  const hasPresentations = presentationCount > 0;
  const sort = query.sort ?? { columnId: "orden", direction: "asc" as const };
  const isSortedByOrder = sort.columnId === "orden" && sort.direction === "asc";
  const canEditOrder = hasPresentations && unorderedCount === 0;
  const canDrag = canEditOrder && isSortedByOrder;
  const flaggedCount = rows.filter(
    (row) => (warnings.get(row.id)?.length ?? 0) > 0,
  ).length;
  const selectedRows = rows.filter(
    (row) => selectedRowIds.includes(row.id) && row.presentationId !== null,
  );
  const removableJudgeCount = judges.filter((judge) =>
    selectedRows.some((row) => row.judgeIds.includes(judge.id)),
  ).length;

  const visibleRows = sortRows(
    rows.filter(
      (row) =>
        matchesSearch(row, query.search) &&
        (!query.onlyWarnings || (warnings.get(row.id)?.length ?? 0) > 0) &&
        (variant !== "C" ||
          query.scheduleTab === "todos" ||
          row.schedule?.id === query.scheduleTab),
    ),
    sort,
  );
  const totalPages = Math.max(1, Math.ceil(visibleRows.length / pageSize));
  const pageRows = visibleRows.slice(
    (query.page - 1) * pageSize,
    query.page * pageSize,
  );
  const initialFacetedFilterValues = useMemo(
    () => ({
      filters: query.onlyWarnings
        ? { advertencias: "con" }
        : ({} as Record<string, string>),
    }),
    [query.onlyWarnings],
  );

  function moveTo(rowId: string, toOrderNumber: number) {
    const row = rows.find((candidate) => candidate.id === rowId);

    if (!row?.orderNumber || row.orderNumber === toOrderNumber) {
      return;
    }

    if (conflict) {
      record(
        `movePresentation(${row.presentationId}, ${row.orderNumber} → ${toOrderNumber}) → rechazado: fromOrderNumber viejo`,
      );
      showToastMessage({
        variant: "error",
        message:
          "El orden cambió mientras movías la fila; se actualizó la lista.",
      });
      return;
    }

    setRows((current) => movePresentation(current, rowId, toOrderNumber));
    record(
      `movePresentation(${row.presentationId}, ${row.orderNumber} → ${toOrderNumber}) → renumerado 1..${presentationCount}`,
    );
  }

  const columns = buildColumns({
    canDrag,
    canEditOrder,
    hasPresentations,
    maxOrderNumber: presentationCount,
    onCommitOrder: moveTo,
    showSchedule: variant !== "B",
    warnings,
  });

  const actionsMenu = (
    <ResourceActionsMenu contentClassName="w-56">
      {variant !== "B" ? (
        <>
          <DropdownMenuItem
            disabled={eligibleCount === 0}
            onSelect={(event) => {
              event.preventDefault();
              setDialog("ordering");
            }}
          >
            <ListOrdered aria-hidden="true" />
            Ordenar automáticamente
          </DropdownMenuItem>
          <DropdownMenuSeparator />
        </>
      ) : null}
      <DropdownMenuItem
        disabled={selectedRows.length === 0}
        onSelect={(event) => {
          event.preventDefault();
          setDialog("assign");
        }}
      >
        <Check aria-hidden="true" />
        Asignar jueces
      </DropdownMenuItem>
      <DropdownMenuItem
        disabled={selectedRows.length === 0 || removableJudgeCount === 0}
        onSelect={(event) => {
          event.preventDefault();
          setDialog("remove");
        }}
      >
        <UserMinus aria-hidden="true" />
        Quitar jueces
      </DropdownMenuItem>
    </ResourceActionsMenu>
  );

  const headerAction =
    variant === "B" ? (
      <div className="flex items-center gap-2">
        <Button
          type="button"
          disabled={eligibleCount === 0}
          onClick={() => setDialog("ordering")}
        >
          <ListOrdered aria-hidden="true" data-icon="inline-start" />
          Ordenar automáticamente
        </Button>
        {actionsMenu}
      </div>
    ) : (
      actionsMenu
    );

  const table = (
    <ServerDataTable
      rows={pageRows}
      columns={columns}
      getRowKey={(row) => row.id}
      layout="fit"
      searchPlaceholder="Buscar por número de coreografía, nombre o academia"
      initialSearchValue={query.search}
      initialSort={sort}
      facetedFilters={variant === "C" ? warningsFacetedFilters : undefined}
      initialFacetedFilterValues={
        variant === "C" ? initialFacetedFilterValues : undefined
      }
      selectableRows
      canSelectRow={(row) => row.presentationId !== null}
      selectedRowIds={selectedRowIds}
      onSelectedRowIdsChange={setSelectedRowIds}
      reorder={
        hasPresentations
          ? {
              enabled: canDrag,
              onMove: (activeRowKey, overRowKey) => {
                const over = rows.find((row) => row.id === overRowKey);

                if (over?.orderNumber) {
                  moveTo(activeRowKey, over.orderNumber);
                }
              },
            }
          : undefined
      }
      getRowGroup={
        variant === "B" && isSortedByOrder
          ? (row) =>
              row.orderNumber === null
                ? { key: "sin-numero", label: "Sin número de presentación" }
                : {
                    key: row.schedule?.id ?? "sin-cronograma",
                    label: formatScheduleLabel(row.schedule),
                  }
          : undefined
      }
      emptyMessage="No hay coreografías que coincidan con la búsqueda o los filtros."
      currentPage={query.page}
      totalPages={totalPages}
      totalRows={rows.length}
    />
  );

  return (
    <AdminResourceLayout
      selectedEventId={caseId === "sin-evento" ? null : "evento-prototipo"}
      title={variant === "A" ? "Coreografías" : "Lista de participación"}
      description={
        variant === "A"
          ? "Revisá las coreografías registradas para el evento activo y su estado operativo."
          : "Ordená las presentaciones del evento activo y asigná jueces."
      }
      eventRequiredEmptyState={{
        title: "Elegí un evento activo para ordenar la participación",
        description:
          "Activá un evento para numerar sus presentaciones y asignar jueces.",
      }}
      headerAction={rows.length > 0 ? headerAction : undefined}
    >
      <TooltipProvider>
        <div className="flex flex-col gap-6">
          {variant === "A" ? (
            <Tabs
              value="participacion"
              onValueChange={(value) => {
                if (value === "operativa") {
                  void navigate("/administracion/coreografias");
                }
              }}
            >
              <TabsList variant="line">
                <TabsTrigger value="operativa">Operativa</TabsTrigger>
                <TabsTrigger value="participacion">Participación</TabsTrigger>
              </TabsList>
            </Tabs>
          ) : null}

          {rows.length === 0 ? (
            <AdminEmptyState
              icon={ListOrdered}
              title="Todavía no hay coreografías para ordenar."
              description="Una coreografía entra en esta lista cuando cubre su seña y tiene categoría. Cuando haya alguna, vas a poder ordenarlas acá."
            />
          ) : (
            <>
              {variant === "B" ? (
                <section className="grid gap-4 sm:grid-cols-3">
                  <MetricCard
                    title="Con número"
                    value={`${presentationCount} de ${eligibleCount}`}
                  />
                  <MetricCard
                    title="Con advertencias"
                    value={String(flaggedCount)}
                  />
                  <MetricCard
                    title="Sin jueces"
                    value={String(
                      rows.filter(
                        (row) =>
                          row.presentationId !== null &&
                          row.judgeIds.length === 0,
                      ).length,
                    )}
                  />
                </section>
              ) : null}

              <ListNotices
                canEditOrder={canEditOrder}
                flaggedCount={variant === "C" ? 0 : flaggedCount}
                hasPresentations={hasPresentations}
                isSortedByOrder={isSortedByOrder}
                onlyWarnings={query.onlyWarnings}
                onOpenOrdering={() => setDialog("ordering")}
                onToggleOnlyWarnings={onToggleOnlyWarnings}
                unorderedCount={unorderedCount}
              />

              {variant === "C" ? (
                <Tabs value={query.scheduleTab} onValueChange={setScheduleTab}>
                  <TabsList variant="line">
                    <TabsTrigger value="todos">Todos</TabsTrigger>
                    {schedules.map((schedule) => (
                      <TabsTrigger key={schedule.id} value={schedule.id}>
                        {formatScheduleLabel(schedule)}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              ) : null}

              {table}
            </>
          )}

          <PrototypeState
            caseId={caseId}
            flaggedCount={flaggedCount}
            log={log}
            presentationCount={presentationCount}
            selectedCount={selectedRows.length}
            unorderedCount={unorderedCount}
            canDrag={canDrag}
          />
        </div>
      </TooltipProvider>

      {dialog === "ordering" ? (
        <OrderingDialog
          rows={rows}
          onOpenChange={(open) => !open && setDialog(null)}
          onConfirm={() => {
            const result = runAutomaticOrdering(rows);
            const ordered = result.rows.filter(
              (row) => row.orderNumber !== null,
            ).length;

            setRows(result.rows);
            record(
              `runAutomaticOrdering → ${ordered} numeradas, ${result.removedPresentationCount} presentaciones y ${result.removedAssignmentCount} asignaciones quitadas`,
            );
            showToastMessage({
              variant: "success",
              message: `Se ordenaron ${ordered} presentaciones.`,
            });
          }}
        />
      ) : null}

      {dialog === "assign" || dialog === "remove" ? (
        <JudgesDialog
          mode={dialog}
          selectedRows={selectedRows}
          onOpenChange={(open) => !open && setDialog(null)}
          onConfirm={(judgeIds) => {
            const selected = new Set(selectedRows.map((row) => row.id));

            setRows((current) =>
              current.map((row) =>
                selected.has(row.id)
                  ? {
                      ...row,
                      judgeIds:
                        dialog === "assign"
                          ? [...new Set([...row.judgeIds, ...judgeIds])]
                          : row.judgeIds.filter((id) => !judgeIds.includes(id)),
                    }
                  : row,
              ),
            );
            record(
              `${dialog === "assign" ? "assignJudges" : "removeJudges"}(${judgeIds.join(", ")}) × ${selected.size} presentaciones`,
            );
            showToastMessage({
              variant: "success",
              message:
                dialog === "assign"
                  ? `Se asignaron ${formatCount(judgeIds.length, "juez", "jueces")} a ${formatCount(selected.size, "presentación", "presentaciones")}.`
                  : `Se quitaron ${formatCount(judgeIds.length, "juez", "jueces")} de ${formatCount(selected.size, "presentación", "presentaciones")}.`,
            });
          }}
        />
      ) : null}
    </AdminResourceLayout>
  );
}

function matchesSearch(row: ParticipationRow, search: string) {
  const query = search.trim().toLowerCase();

  if (query.length === 0) {
    return true;
  }

  return [
    formatEventSequenceNumber(row.choreographyNumber),
    String(row.choreographyNumber),
    row.name,
    row.academyName,
  ].some((value) => value.toLowerCase().includes(query));
}

function sortRows(
  rows: ParticipationRow[],
  sort: { columnId: string; direction: "asc" | "desc" },
) {
  const factor = sort.direction === "asc" ? 1 : -1;
  const text = (row: ParticipationRow) =>
    sort.columnId === "nombre"
      ? row.name
      : sort.columnId === "academia"
        ? row.academyName
        : row.schedule
          ? `${row.schedule.scheduledDate} ${row.schedule.startTime}`
          : "~";

  return [...rows].sort((a, b) => {
    if (sort.columnId === "orden") {
      // Map decision 3: numbered rows first, the rest after by choreography number.
      const aKey = a.orderNumber ?? Number.MAX_SAFE_INTEGER;
      const bKey = b.orderNumber ?? Number.MAX_SAFE_INTEGER;

      return (
        factor * (aKey - bKey) || a.choreographyNumber - b.choreographyNumber
      );
    }

    return (
      factor * text(a).localeCompare(text(b)) ||
      a.choreographyNumber - b.choreographyNumber
    );
  });
}
