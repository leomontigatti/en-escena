/**
 * THROWAWAY PROTOTYPE — ticket #585 of map #547.
 *
 * The choreography's roster, which is where the discount is a bare number
 * today. The three variants differ in exactly one cell:
 *
 * - **A** — the amount alone. Whatever explains it lives in the section below,
 *   and the row does not point at it.
 * - **B** — the amount with an affordance into the section, which scrolls to
 *   the dancer's line and highlights it.
 * - **C** — no section at all: the amount opens a `Popover` with the same
 *   composition, in place.
 *
 * **#618's rule is respected literally**: `Precio base` is muted and `Saldo
 * adeudado` is `font-medium` — at column level, unconditionally, never per row.
 * The discount affordance must not reintroduce a grey that varies, so the cell
 * changes its *interaction*, never its colour.
 */
import { useMemo } from "react";

import { ClientDataTable } from "@/components/shared/client-data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { DataTableColumn } from "@/components/shared/data-table.shared";

import { formatAmount } from "../formatters";
import {
  inscriptionStatusBadgeVariants,
  inscriptionStatusLabels,
  type InscriptionReading,
} from "./fixtures";
import {
  formatPercentage,
  readProvenanceSummary,
  type PrototypeVariantKey,
} from "./shared";

export function RosterTable({
  inscriptions,
  variant,
  onFocusDancer,
}: {
  inscriptions: InscriptionReading[];
  variant: PrototypeVariantKey;
  onFocusDancer: (dancerId: string) => void;
}) {
  const columns = useMemo(
    () => buildColumns(variant, onFocusDancer),
    [variant, onFocusDancer],
  );

  return (
    <ClientDataTable<InscriptionReading>
      rows={inscriptions}
      columns={columns}
      getRowKey={(row) => row.id}
      initialSort={{ columnId: "dancer", direction: "asc" }}
      emptyMessage="No hay inscripciones para mostrar."
      searchPlaceholder="Buscar inscripción por bailarín"
      hideSearch
      hidePagination
    />
  );
}

function buildColumns(
  variant: PrototypeVariantKey,
  onFocusDancer: (dancerId: string) => void,
): DataTableColumn<InscriptionReading>[] {
  return [
    {
      id: "dancer",
      header: "Bailarín",
      className: "min-w-56 font-medium",
      cell: (row) => (
        <div className="flex flex-wrap items-center gap-2">
          <span>{row.dancerName}</span>
          {row.withdrawnAt !== null ? (
            <Badge variant="secondary">Dada de baja</Badge>
          ) : null}
        </div>
      ),
      sortValue: (row) => row.dancerName,
    },
    {
      // Context, not the actionable figure — muted for the whole column (#618).
      id: "priceAmount",
      header: "Precio base",
      className: "text-right tabular-nums text-muted-foreground",
      headerClassName: "text-right",
      cell: (row) => formatAmount(row.priceAmount),
    },
    {
      id: "discountAmount",
      header: "Descuento",
      className: "text-right tabular-nums",
      headerClassName: "text-right",
      cell: (row) => (
        <DiscountCell
          inscription={row}
          variant={variant}
          onFocusDancer={onFocusDancer}
        />
      ),
    },
    {
      id: "totalAmount",
      header: "Total",
      className: "text-right tabular-nums",
      headerClassName: "text-right",
      cell: (row) => formatAmount(row.totalAmount),
    },
    {
      id: "owedBalanceAmount",
      header: "Saldo adeudado",
      className: "text-right font-medium tabular-nums",
      headerClassName: "text-right",
      cell: (row) => formatAmount(row.owedBalanceAmount),
    },
    {
      id: "status",
      header: "Estado",
      cell: (row) => (
        <Badge variant={inscriptionStatusBadgeVariants[row.status]}>
          {inscriptionStatusLabels[row.status]}
        </Badge>
      ),
    },
  ];
}

function DiscountCell({
  inscription,
  variant,
  onFocusDancer,
}: {
  inscription: InscriptionReading;
  variant: PrototypeVariantKey;
  onFocusDancer: (dancerId: string) => void;
}) {
  const amount = formatAmount(inscription.discountAmount);

  if (variant === "A") {
    return amount;
  }

  if (variant === "B") {
    return (
      <Button
        type="button"
        variant="link"
        className="h-auto p-0 tabular-nums"
        onClick={() => onFocusDancer(inscription.dancerId)}
      >
        {amount}
      </Button>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="link"
          className="h-auto p-0 tabular-nums"
        >
          {amount}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-80 flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">{inscription.dancerName}</span>
          <Badge
            variant={
              inscription.provenance.percentage > 0 ? "info" : "secondary"
            }
          >
            {formatPercentage(inscription.provenance.percentage)}
          </Badge>
        </div>

        <p className="text-sm text-muted-foreground">
          {readProvenanceSummary(inscription.provenance)}
        </p>

        <div className="flex flex-col gap-1">
          {inscription.provenance.qualifying.map((row) => (
            <div
              key={row.inscriptionId}
              className="flex items-center justify-between gap-2 text-sm"
            >
              <span>
                {row.choreographyName}
                {row.isFocusChoreography ? " · esta" : ""}
              </span>
              <span className="tabular-nums text-muted-foreground">
                {row.isExcluded
                  ? "sin descuento"
                  : formatAmount(row.discountAmount)}
              </span>
            </div>
          ))}
          {inscription.provenance.withdrawn.map((row) => (
            <div
              key={row.inscriptionId}
              className="flex items-center justify-between gap-2 text-sm text-muted-foreground"
            >
              <span>{row.choreographyName}</span>
              <span>dada de baja</span>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
