// PROTOTYPE — throwaway, lives only on branch `prototype/912-participation-list`
// (wayfinder ticket #912, map #907). The participation list's columns and cells.
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
  type ParticipationRow,
  type PresentationWarning,
  type PrototypeJudge,
} from "./participation-fixtures.prototype";

/**
 * Columns after the third review, in block order: number, then what the
 * automatic ordering groups by, then who and what. The status column carries
 * the warnings as plain badges and leaves room for other states later.
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
      width: 8,
      cell: (row) => (
        <OrderNumberCell
          canEdit={canEditOrder}
          max={maxOrderNumber}
          onCommit={(value) => onCommitOrder(row.id, value)}
          row={row}
        />
      ),
      sortValue: (row) => row.orderNumber,
    },
    {
      id: "categoriaTipoGrupo",
      header: "Categoría / Tipo de grupo",
      width: 19,
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
      id: "modalidadSubmodalidad",
      header: "Modalidad / Submodalidad",
      width: 19,
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
      width: 17,
      className: "text-muted-foreground",
      cell: (row) => <DataTableTruncatedText value={row.academyName} />,
      sortValue: (row) => row.academyName,
    },
    {
      id: "nombre",
      header: "Nombre",
      width: 19,
      className: "font-medium",
      // The choreography number is not a column (map decision 8), so the name
      // is the way into the detail here. The cut wraps the link, not the other
      // way round: the link button shrinks to its content and would cut early.
      cell: (row) => (
        <DataTableTruncatedText
          value={`${row.name} · ${formatEventSequenceNumber(row.choreographyNumber)}`}
        >
          <DataTableLink to={`/administracion/coreografias/${row.id}`}>
            {row.name}
          </DataTableLink>
        </DataTableTruncatedText>
      ),
      sortValue: (row) => row.name,
    },
    {
      id: "estado",
      header: "Estado",
      width: 15,
      cell: (row) => <StatusBadges items={warnings.get(row.id) ?? []} />,
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

export function formatJudgeName(judge: PrototypeJudge) {
  if (judge.status === "suspended") {
    return `${judge.name} (Suspendido)`;
  }

  if (judge.status === "noJudgeRole") {
    return `${judge.name} (Sin rol de juez)`;
  }

  return judge.name;
}

const warningBadges: Record<
  PresentationWarning["kind"],
  { label: string; variant: "destructive" | "warning" }
> = {
  dancerSpacing: { label: "Separación", variant: "warning" },
  outOfBlock: { label: "Fuera de bloque", variant: "warning" },
  belowDeposit: { label: "Seña pendiente", variant: "warning" },
  // These two block the automatic ordering, so they read as errors.
  missingCategory: { label: "Sin categoría", variant: "destructive" },
  missingSchedule: { label: "Sin cronograma", variant: "destructive" },
};

/** One badge per warning kind; the tooltip holds each occurrence's detail. */
function StatusBadges({ items }: { items: PresentationWarning[] }) {
  if (items.length === 0) {
    return null;
  }

  const kinds = [...new Set(items.map((item) => item.kind))];

  return (
    <div className="flex flex-wrap gap-1">
      {kinds.map((kind) => (
        <Tooltip key={kind}>
          <TooltipTrigger asChild>
            <Badge variant={warningBadges[kind].variant} tabIndex={0}>
              {warningBadges[kind].label}
            </Badge>
          </TooltipTrigger>
          <TooltipContent className="max-w-80">
            <ul className="flex flex-col gap-1">
              {items
                .filter((item) => item.kind === kind)
                .map((item, index) => (
                  <li key={`${kind}-${index}`}>{item.label}</li>
                ))}
            </ul>
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}
