import { AlertTriangle, Info, ListOrdered } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router";

import {
  AdminEmptyState,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import { AlertStack } from "@/components/shared/alert-stack";
import {
  DataTableTruncatedText,
  ServerDataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
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

import {
  orderAutomaticallyIntent,
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

const presentationColumns: DataTableColumn<PresentationListItem>[] = [
  {
    id: "orden",
    header: "N.º",
    width: 9,
    className: "font-medium tabular-nums",
    cell: (row) => (row.orderNumber === null ? "—" : String(row.orderNumber)),
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

export function PresentationsListView({
  loaderData,
}: PresentationsListViewProps) {
  const [isOrderingDialogOpen, setIsOrderingDialogOpen] = useState(false);

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
              onOrderAutomatically={() => setIsOrderingDialogOpen(true)}
            />
            <PresentationDayTabs loaderData={loaderData} />
            <ServerDataTable
              rows={loaderData.presentations}
              columns={presentationColumns}
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

function PresentationNotices({
  loaderData,
  onOrderAutomatically,
}: {
  loaderData: PresentationListResult;
  onOrderAutomatically: () => void;
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
      {loaderData.warnedCount > 0 ? (
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
      ) : null}
    </AlertStack>
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
