// PROTOTYPE — throwaway, lives only on branch `prototype/912-participation-list`
// (wayfinder ticket #912, map #907). The participation list's columns and cells.
import { useEffect, useState } from "react";

import {
  DataTableTruncatedText,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { DataTableDragHandle } from "@/components/shared/data-table-shell";
import { DataTableLink } from "@/components/shared/data-table-link";
import { ReadOnlyField } from "@/components/shared/read-only-field";
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
  isPlaceable,
  type ParticipationRow,
  type PresentationWarning,
  type PrototypeJudge,
} from "./participation-fixtures.prototype";

/**
 * Columns after the third review, in block order: number, then what the
 * automatic ordering groups by, then who and what. Only the number sorts. The
 * status column carries the most relevant warning and leaves room for other
 * states later.
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
          // Weights add up to 100 with the selection column's 3, sized against
          // the 1152 px content width with real event data (third review).
          width: 3,
          cell: (row) =>
            canDrag && isPlaceable(row) ? (
              <DataTableDragHandle label="Mover presentación" />
            ) : null,
        }
      : null,
    {
      id: "orden",
      header: "N.º",
      width: 9,
      cell: (row) => (
        <OrderNumberCell
          canEdit={canEditOrder && isPlaceable(row)}
          // An unnumbered row can also go last, after the current N.
          max={row.orderNumber === null ? maxOrderNumber + 1 : maxOrderNumber}
          onCommit={(value) => onCommitOrder(row.id, value)}
          row={row}
        />
      ),
      sortValue: (row) => row.orderNumber,
    },
    {
      id: "categoriaTipoGrupo",
      header: "Categoría / Tipo de grupo",
      width: 16,
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
    },
    {
      id: "estado",
      header: "Estado",
      width: 11,
      cell: (row) => <StatusBadge items={warnings.get(row.id) ?? []} />,
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

  // Locked until the first automatic ordering, or while the row lacks the
  // category or schedule its block needs.
  if (!canEdit) {
    return (
      <ReadOnlyField
        className="w-20"
        inputClassName="tabular-nums"
        label={`Número de presentación de ${row.name}`}
        labelClassName="sr-only"
        value={String(row.orderNumber ?? "")}
      />
    );
  }

  const commit = () => {
    if (draft.trim() === "") {
      setDraft(String(row.orderNumber ?? ""));
      setError(null);
      return;
    }

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
            setDraft(String(row.orderNumber ?? ""));
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

// Triage order: what blocks the ordering first, then what hides the
// presentation from the public, then what hurts the dancers, then placement.
const warningTriage: Array<{
  kind: PresentationWarning["kind"];
  label: string;
  variant: "destructive" | "warning";
}> = [
  { kind: "missingSchedule", label: "Sin cronograma", variant: "destructive" },
  { kind: "missingCategory", label: "Sin categoría", variant: "destructive" },
  { kind: "belowDeposit", label: "Seña pendiente", variant: "warning" },
  { kind: "dancerSpacing", label: "Separación", variant: "warning" },
  { kind: "outOfBlock", label: "Fuera de bloque", variant: "warning" },
];

const triageRank = (kind: PresentationWarning["kind"]) =>
  warningTriage.findIndex((entry) => entry.kind === kind);

/**
 * Only the most relevant warning is a badge; the tooltip still lists every
 * warning on the row, most relevant first.
 */
function StatusBadge({ items }: { items: PresentationWarning[] }) {
  const sorted = [...items].sort(
    (a, b) => triageRank(a.kind) - triageRank(b.kind),
  );
  const top = warningTriage.find((entry) => entry.kind === sorted[0]?.kind);

  if (!top) {
    return null;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant={top.variant} tabIndex={0}>
          {top.label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-80">
        <ul className="flex flex-col gap-1">
          {sorted.map((item, index) => (
            <li key={`${item.kind}-${index}`}>{item.label}</li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}
