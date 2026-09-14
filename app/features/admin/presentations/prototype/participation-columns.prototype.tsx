// PROTOTYPE — throwaway, lives only on branch `prototype/912-participation-list`
// (wayfinder ticket #912, map #907). The participation list's columns and cells.
import { AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";

import {
  DataTableTruncatedText,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { DataTableDragHandle } from "@/components/shared/data-table-shell";
import { DataTableLink } from "@/components/shared/data-table-link";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatEventSequenceNumber } from "@/lib/events/sequence-number";
import { formatGroupTypeLabel } from "@/lib/portal/choreographies";
import { formatPrimaryAndSecondaryValue } from "@/lib/shared/format-primary-and-secondary-value";

import {
  judges,
  type ParticipationRow,
  type PresentationWarning,
  type PrototypeJudge,
} from "./participation-fixtures.prototype";

/**
 * Six data columns after the second review: modality is gone (it plays no part
 * in the ordering), the warning rides in the number cell, the schedule is only
 * its start time (the day is the tab) and the judges are a count.
 */
export function buildColumns({
  canDrag,
  canEditOrder,
  hasPresentations,
  maxOrderNumber,
  onCommitOrder,
  warnings,
}: {
  canDrag: boolean;
  canEditOrder: boolean;
  hasPresentations: boolean;
  maxOrderNumber: number;
  onCommitOrder: (rowId: string, toOrderNumber: number) => void;
  showSchedule?: boolean;
  warnings: Map<string, PresentationWarning[]>;
}): DataTableColumn<ParticipationRow>[] {
  const columns: Array<DataTableColumn<ParticipationRow> | null> = [
    hasPresentations
      ? {
          id: "arrastrar",
          header: "",
          leading: true,
          className: "px-1",
          headerClassName: "px-1",
          width: 3,
          cell: () =>
            canDrag ? <DataTableDragHandle label="Mover presentación" /> : null,
        }
      : null,
    {
      id: "orden",
      header: "N.º",
      width: 10,
      cell: (row) => (
        <div className="flex items-center gap-2">
          <OrderNumberCell
            canEdit={canEditOrder}
            max={maxOrderNumber}
            onCommit={(value) => onCommitOrder(row.id, value)}
            row={row}
          />
          <WarningsIndicator items={warnings.get(row.id) ?? []} />
        </div>
      ),
      sortValue: (row) => row.orderNumber,
    },
    {
      id: "nombre",
      header: "Nombre",
      width: 20,
      className: "font-medium",
      // The choreography number is not a column (map decision 8), so the name
      // is the way into the detail here.
      cell: (row) => (
        <DataTableLink to={`/administracion/coreografias/${row.id}`}>
          <DataTableTruncatedText
            value={`${row.name} · ${formatEventSequenceNumber(row.choreographyNumber)}`}
          >
            {row.name}
          </DataTableTruncatedText>
        </DataTableLink>
      ),
      sortValue: (row) => row.name,
    },
    {
      id: "academia",
      header: "Academia",
      width: 18,
      className: "text-muted-foreground",
      cell: (row) => <DataTableTruncatedText value={row.academyName} />,
      sortValue: (row) => row.academyName,
    },
    {
      id: "categoriaTipoGrupo",
      header: "Categoría / Tipo de grupo",
      width: 18,
      className: "text-muted-foreground",
      cell: (row) => (
        <DataTableTruncatedText
          value={formatPrimaryAndSecondaryValue(
            row.category?.name ?? "Sin asignar",
            formatGroupTypeLabel(row.groupType),
          )}
        />
      ),
    },
    {
      id: "cronograma",
      header: "Horario",
      width: 8,
      className: "text-muted-foreground tabular-nums",
      cell: (row) => <ScheduleTimeCell row={row} />,
      sortValue: (row) =>
        row.schedule
          ? `${row.schedule.scheduledDate} ${row.schedule.startTime}`
          : null,
    },
    {
      id: "jueces",
      header: "Jueces",
      width: 10,
      cell: (row) =>
        row.presentationId === null ? null : (
          <JudgesCell judgeIds={row.judgeIds} />
        ),
    },
  ];

  return columns.filter(
    (column): column is DataTableColumn<ParticipationRow> => column !== null,
  );
}

function OrderNumberCell({
  canEdit,
  max,
  onCommit,
  row,
}: {
  canEdit: boolean;
  max: number;
  onCommit: (value: number) => void;
  row: ParticipationRow;
}) {
  const [draft, setDraft] = useState(String(row.orderNumber ?? ""));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(String(row.orderNumber ?? ""));
    setError(null);
  }, [row.orderNumber]);

  if (row.orderNumber === null) {
    return <Badge variant="outline">Sin número</Badge>;
  }

  if (!canEdit) {
    return <span className="font-medium tabular-nums">{row.orderNumber}</span>;
  }

  const commit = () => {
    const value = Number(draft);

    if (value === row.orderNumber) {
      setError(null);
      return;
    }

    if (!Number.isInteger(value) || value < 1 || value > max) {
      setError(`Entre 1 y ${max}`);
      return;
    }

    setError(null);
    onCommit(value);
  };

  return (
    <div className="flex flex-col gap-1">
      <Input
        aria-label={`Número de presentación de ${row.name}`}
        aria-invalid={error ? true : undefined}
        className="w-16 tabular-nums"
        inputMode="numeric"
        value={draft}
        onBlur={commit}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }

          if (event.key === "Escape") {
            setDraft(String(row.orderNumber));
            setError(null);
          }
        }}
      />
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function ScheduleTimeCell({ row }: { row: ParticipationRow }) {
  if (!row.schedule) {
    return <span>Sin cronograma</span>;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0}>{row.schedule.startTime}</span>
      </TooltipTrigger>
      <TooltipContent>{row.schedule.name}</TooltipContent>
    </Tooltip>
  );
}

export function formatJudgeName(judge: PrototypeJudge) {
  if (judge.status === "suspended") {
    return `${judge.name} (Suspendido)`;
  }

  if (judge.status === "noJudgeRole") {
    return `${judge.name} (Sin rol de juez)`;
  }

  return judge.name;
}

function JudgesCell({ judgeIds }: { judgeIds: string[] }) {
  const assigned = judgeIds
    .map((id) => judges.find((judge) => judge.id === id))
    .filter((judge): judge is PrototypeJudge => judge !== undefined);

  if (assigned.length === 0) {
    return <span className="text-muted-foreground">Sin jueces</span>;
  }

  const isAnyFlagged = assigned.some((judge) => judge.status !== "active");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant={isAnyFlagged ? "warning" : "secondary"} tabIndex={0}>
          {assigned.length === 1 ? "1 juez" : `${assigned.length} jueces`}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <ul className="flex flex-col gap-1">
          {assigned.map((judge) => (
            <li key={judge.id}>{formatJudgeName(judge)}</li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}

function WarningsIndicator({ items }: { items: PresentationWarning[] }) {
  if (items.length === 0) {
    return null;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="warning"
          tabIndex={0}
          aria-label={
            items.length === 1 ? "Advertencia" : `${items.length} advertencias`
          }
        >
          <AlertTriangle aria-hidden="true" />
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-80">
        <ul className="flex flex-col gap-1">
          {items.map((item, index) => (
            <li key={`${item.kind}-${index}`}>{item.label}</li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}
