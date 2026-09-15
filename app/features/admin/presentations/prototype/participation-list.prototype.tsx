// PROTOTYPE — throwaway, lives only on branch `prototype/912-participation-list`
// (wayfinder ticket #912, map #907). The admin presentation list as the first
// review chose it: its own page, tabs by day, warnings as a notice, every action
// in the actions menu. On the shared `ServerDataTable` with branch-only seams
// (`canSelectRow`, `reorder`, `leading`). Every write lands in memory.
import { Check, ListOrdered, UserMinus } from "lucide-react";
import { useMemo, useState } from "react";

import {
  AdminEmptyState,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import { ServerDataTable } from "@/components/shared/data-table";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import { formatDate } from "@/features/admin/schedules/view-shared";
import { formatEventSequenceNumber } from "@/lib/events/sequence-number";
import { showToastMessage } from "@/lib/shared/toasts";

import { buildColumns } from "./participation-columns.prototype";
import {
  formatCount,
  JudgesDialog,
  OrderingDialog,
} from "./participation-dialogs.prototype";
import {
  blocksOrdering,
  buildCaseRows,
  isBlockingWarning,
  derivePresentationWarnings,
  judges,
  movePresentation,
  runAutomaticOrdering,
  schedules,
  type ParticipationRow,
  type PrototypeCaseId,
} from "./participation-fixtures.prototype";
import { ListNotices, PrototypeState } from "./participation-notices.prototype";

export type WarningFilter = "con" | "bloqueantes";

export type ParticipationQuery = {
  day: string;
  warningFilter: WarningFilter | null;
  page: number;
  search: string;
  sort: { columnId: string; direction: "asc" | "desc" } | null;
};

const pageSize = 50;

const eventDays = [
  ...new Set(schedules.map((schedule) => schedule.scheduledDate)),
].sort();

export function ParticipationListPrototype({
  caseId,
  conflict,
  onToggleWarningFilter,
  query,
  setDay,
}: {
  caseId: PrototypeCaseId;
  conflict: boolean;
  onToggleWarningFilter: (filter: WarningFilter) => void;
  query: ParticipationQuery;
  setDay: (day: string) => void;
}) {
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
  // Late rows no longer lock the order (third review): they can be placed.
  const canEditOrder = hasPresentations;
  const canDrag = canEditOrder && isSortedByOrder;
  // The rows that stop the automatic ordering get their own notice; the
  // warnings notice counts only the rest (fourth review).
  const blockingCount = rows.filter(blocksOrdering).length;
  const hasOtherWarnings = (row: ParticipationRow) =>
    (warnings.get(row.id) ?? []).some((warning) => !isBlockingWarning(warning));
  const flaggedCount = rows.filter(hasOtherWarnings).length;
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
        (query.warningFilter !== "con" || hasOtherWarnings(row)) &&
        (query.warningFilter !== "bloqueantes" || blocksOrdering(row)) &&
        (query.day === "todos" || row.schedule?.scheduledDate === query.day),
    ),
    sort,
  );
  const totalPages = Math.max(1, Math.ceil(visibleRows.length / pageSize));
  const pageRows = visibleRows.slice(
    (query.page - 1) * pageSize,
    query.page * pageSize,
  );

  function moveTo(rowId: string, toOrderNumber: number) {
    const row = rows.find((candidate) => candidate.id === rowId);

    if (!row || row.orderNumber === toOrderNumber) {
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
      row.orderNumber === null
        ? `movePresentation(nueva ${row.id}, → ${toOrderNumber}) → creada, renumerado 1..${presentationCount + 1}`
        : `movePresentation(${row.presentationId}, ${row.orderNumber} → ${toOrderNumber}) → renumerado 1..${presentationCount}`,
    );
  }

  const columns = buildColumns({
    canDrag,
    canEditOrder,
    hasPresentations,
    maxOrderNumber: presentationCount,
    onCommitOrder: moveTo,
    showSchedule: true,
    warnings,
  });

  return (
    <AdminResourceLayout
      selectedEventId={caseId === "sin-evento" ? null : "evento-prototipo"}
      title="Presentación"
      description="Ordená las presentaciones del evento activo y asigná jueces."
      eventRequiredEmptyState={{
        title: "Elegí un evento activo para ordenar la presentación",
        description:
          "Activá un evento para numerar sus presentaciones y asignar jueces.",
      }}
      headerAction={
        rows.length > 0 ? (
          <ResourceActionsMenu contentClassName="w-56">
            <DropdownMenuItem
              disabled={eligibleCount === 0 || blockingCount > 0}
              onSelect={(event) => {
                event.preventDefault();
                setDialog("ordering");
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
        ) : undefined
      }
    >
      <TooltipProvider>
        <div className="flex flex-col gap-6">
          {rows.length === 0 ? (
            <AdminEmptyState
              icon={ListOrdered}
              title="Todavía no hay coreografías para ordenar."
              description="Una coreografía entra en esta lista cuando cubre su seña y tiene categoría. Cuando haya alguna, vas a poder ordenarlas acá."
            />
          ) : (
            <>
              <ListNotices
                canEditOrder={canEditOrder}
                flaggedCount={flaggedCount}
                hasPresentations={hasPresentations}
                isSortedByOrder={isSortedByOrder}
                blockingCount={blockingCount}
                warningFilter={query.warningFilter}
                onOrderAutomatically={() => setDialog("ordering")}
                onToggleWarningFilter={onToggleWarningFilter}
                unorderedCount={unorderedCount}
              />

              <Tabs value={query.day} onValueChange={setDay}>
                <TabsList variant="line">
                  <TabsTrigger value="todos">Todos</TabsTrigger>
                  {eventDays.map((day) => (
                    <TabsTrigger key={day} value={day}>
                      {formatDate(day)}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>

              <ServerDataTable
                rows={pageRows}
                columns={columns}
                getRowKey={(row) => row.id}
                layout="fit"
                searchPlaceholder="Buscar por número de coreografía, nombre o academia"
                initialSearchValue={query.search}
                initialSort={sort}
                selectableRows
                canSelectRow={(row) => row.presentationId !== null}
                selectedRowIds={selectedRowIds}
                onSelectedRowIdsChange={setSelectedRowIds}
                reorder={
                  hasPresentations
                    ? {
                        enabled: canDrag,
                        onMove: (activeRowKey, overRowKey) => {
                          const over = rows.find(
                            (row) => row.id === overRowKey,
                          );

                          if (over?.orderNumber) {
                            moveTo(activeRowKey, over.orderNumber);
                          }
                        },
                      }
                    : undefined
                }
                emptyMessage="No hay coreografías que coincidan con la búsqueda o los filtros."
                currentPage={query.page}
                totalPages={totalPages}
                totalRows={rows.length}
              />
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

/** Only the presentation number sorts (third review). */
function sortRows(
  rows: ParticipationRow[],
  sort: { columnId: string; direction: "asc" | "desc" },
) {
  const factor = sort.direction === "asc" ? 1 : -1;

  return [...rows].sort((a, b) => {
    // Map decision 3: numbered rows first, the rest after by choreography number.
    const aKey = a.orderNumber ?? Number.MAX_SAFE_INTEGER;
    const bKey = b.orderNumber ?? Number.MAX_SAFE_INTEGER;

    return (
      factor * (aKey - bKey) || a.choreographyNumber - b.choreographyNumber
    );
  });
}
