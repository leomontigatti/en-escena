import { useMemo, useState } from "react";

import {
  ClientDataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EditRefundDialog } from "@/features/admin/finances/refunds/edit-dialog";
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
 * in the active event, newest first, never its allocations. A refund's number
 * opens its edit/delete dialog, since a refund has no page of its own.
 */
export function OwnerMovementsTab({
  availableBalanceAmount,
  movements,
}: {
  availableBalanceAmount: number;
  movements: OwnerMovementRow[];
}) {
  const [openRefundId, setOpenRefundId] = useState<string | null>(null);
  // Read from the revalidated rows, so a refund deleted meanwhile closes its
  // dialog.
  const openRefund = movements.find(
    (row) => row.kind === "refund" && row.id === openRefundId,
  );
  const columns = useMemo(
    () => ownerMovementColumns({ onOpenRefund: setOpenRefundId }),
    [],
  );

  return (
    <div className="flex flex-col gap-4">
      <ClientDataTable
        rows={movements}
        columns={columns}
        getRowKey={(row) => `${row.kind}:${row.id}`}
        searchPlaceholder="Buscar por número o referencia"
        textFilterColumnId="reference"
        pageSize={25}
        emptyMessage="No hay movimientos para mostrar."
      />
      {openRefund ? (
        <EditRefundDialog
          key={openRefund.id}
          availableBalanceAmount={availableBalanceAmount}
          onOpenChange={(open) => {
            if (!open) {
              setOpenRefundId(null);
            }
          }}
          refund={openRefund}
        />
      ) : null}
    </div>
  );
}

function ownerMovementColumns({
  onOpenRefund,
}: {
  onOpenRefund: (refundId: string) => void;
}): DataTableColumn<OwnerMovementRow>[] {
  return [
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
      cell: (row) =>
        row.kind === "refund" ? (
          <Button
            type="button"
            variant="link"
            className="h-auto p-0 text-left font-medium tabular-nums"
            onClick={() => onOpenRefund(row.id)}
          >
            {formatEventSequenceNumber(row.number)}
          </Button>
        ) : (
          formatEventSequenceNumber(row.number)
        ),
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
}
