import { useState } from "react";

import {
  ClientDataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RegisterRefundDialog } from "@/features/admin/finances/refunds/register-dialog";
import { formatEventSequenceNumber } from "@/lib/events/sequence-number";
import { formatAmount, formatDate } from "@/lib/finances/formatters";
import {
  getMovementKindBadgeVariant,
  movementKindLabels,
} from "@/lib/finances/movement-kinds";
import {
  formatPaymentMethodLabel,
  getPaymentMethodBadgeVariant,
} from "@/lib/finances/payment-methods";

import type { OwnerMovementRow } from "./server";

/**
 * The `Movimientos` tab of an owner's finance page: its payments and refunds
 * in the active event, newest first, never its allocations. It holds the only
 * `Registrar reembolso`, so a refund is always registered with the owner's
 * `Saldo disponible` in sight.
 */
export function OwnerMovementsTab({
  availableBalanceAmount,
  movements,
}: {
  availableBalanceAmount: number;
  movements: OwnerMovementRow[];
}) {
  const [isRegistering, setIsRegistering] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button type="button" onClick={() => setIsRegistering(true)}>
          Registrar reembolso
        </Button>
      </div>
      <ClientDataTable
        rows={movements}
        columns={ownerMovementColumns}
        getRowKey={(row) => `${row.kind}:${row.id}`}
        searchPlaceholder="Buscar por número o referencia"
        textFilterColumnId="reference"
        pageSize={25}
        emptyMessage="No hay movimientos para mostrar."
      />
      {isRegistering ? (
        <RegisterRefundDialog
          availableBalanceAmount={availableBalanceAmount}
          onOpenChange={setIsRegistering}
        />
      ) : null}
    </div>
  );
}

const ownerMovementColumns: DataTableColumn<OwnerMovementRow>[] = [
  {
    id: "kind",
    header: "Tipo",
    cell: (row) => (
      <Badge variant={getMovementKindBadgeVariant(row.kind)}>
        {movementKindLabels[row.kind]}
      </Badge>
    ),
  },
  {
    id: "number",
    header: "#",
    className: "font-medium tabular-nums",
    // Each kind counts in its own series, so a number is only read beside
    // its kind.
    cell: (row) => formatEventSequenceNumber(row.number),
  },
  {
    id: "date",
    header: "Fecha",
    cell: (row) => formatDate(row.date),
  },
  {
    id: "reference",
    header: "Referencia",
    className: "min-w-56 text-muted-foreground",
    cell: (row) => row.reference ?? "",
    // The padded form also holds the raw number, so `42` matches as `00042` does.
    filterValue: (row) =>
      `${row.reference ?? ""} ${formatEventSequenceNumber(row.number)}`,
  },
  {
    id: "method",
    header: "Medio",
    cell: (row) => (
      <Badge variant={getPaymentMethodBadgeVariant(row.method)}>
        {formatPaymentMethodLabel(row.method)}
      </Badge>
    ),
  },
  {
    id: "amount",
    header: "Monto",
    className: "text-right tabular-nums",
    headerClassName: "text-right",
    cell: (row) => formatAmount(row.amount),
  },
];
