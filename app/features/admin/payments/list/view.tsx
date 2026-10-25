import { HandCoins } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  AdminEmptyState,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import {
  ServerDataTable,
  type DataTableColumn,
  type DataTableFacetedFilter,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import type { DataTableFacetedFilterValue } from "@/components/shared/data-table.shared";
import { MetricCard } from "@/components/shared/metric-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EditRefundDialog } from "@/features/admin/finances/refunds/edit-dialog";
import { formatAmount, formatDate } from "@/lib/finances/formatters";
import {
  getMovementKindBadgeVariant,
  movementKindLabels,
} from "@/lib/finances/movement-kinds";
import {
  formatPaymentMethodLabel,
  getPaymentMethodBadgeVariant,
  paymentMethodOptions,
  paymentMethodValues,
} from "@/lib/finances/payment-methods";
import { formatEventSequenceNumber } from "@/lib/events/sequence-number";
import {
  movementRowKey,
  resolveSelectedMovementTotals,
} from "@/lib/finances/selected-movement-totals";
import { describeEmptyList } from "@/lib/list-query/list-query";
import { collectionExportPath } from "@/features/admin/payments/export/shared";
import { PeriodExportMenu } from "@/features/admin/period-export/menu";

import type { MovementsListLoaderData, MovementsListRow } from "./server";

type MovementsListRouteViewProps = {
  loaderData: MovementsListLoaderData;
};

function movementColumns({
  onOpenRefund,
}: {
  onOpenRefund: (refundId: string) => void;
}): DataTableColumn<MovementsListRow>[] {
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
      // Each kind counts in its own series, so a number is only read beside
      // its kind. A payment opens its page; a refund has none, so it opens its
      // dialog in place.
      id: "number",
      header: "#",
      className: "font-medium tabular-nums",
      cell: (row) =>
        row.kind === "payment" ? (
          <DataTableLink
            recordTitle
            to={`/administracion/movimientos/pagos/${row.id}`}
          >
            {formatEventSequenceNumber(row.number)}
          </DataTableLink>
        ) : (
          <Button
            type="button"
            variant="link"
            className="h-auto p-0 text-left font-medium tabular-nums"
            onClick={() => onOpenRefund(row.id)}
          >
            {formatEventSequenceNumber(row.number)}
          </Button>
        ),
    },
    {
      id: "date",
      header: "Fecha",
      cell: (row) => formatDate(row.date),
      sortValue: (row) => row.date,
    },
    {
      id: "academyName",
      header: "Academia",
      className: "min-w-56 text-muted-foreground",
      cell: (row) => row.academyName,
      filterValue: (row) => `${row.academyName} ${row.number}`,
    },
    {
      id: "method",
      header: "Medio",
      cell: (row) => (
        <Badge variant={getPaymentMethodBadgeVariant(row.method)}>
          {formatPaymentMethodLabel(row.method)}
        </Badge>
      ),
      filterValue: (row) => row.method,
    },
    {
      // Positive on both kinds, and muted like `Total` on the finance lists:
      // the badge says which way the money went, and the amount is the context
      // the remainder is read against.
      id: "amount",
      header: "Monto",
      className: "text-right tabular-nums text-muted-foreground",
      headerClassName: "text-right",
      cell: (row) => formatAmount(row.amount),
    },
    {
      // A payment's actionable figure, emphasised by column: money received
      // and not yet committed to any inscription. `$ 0` and not a dash on a
      // fully applied payment — a zero there is an answer. A refund has no
      // `Disponible`, so its cell is empty rather than a zero.
      id: "availableAmount",
      header: "Disponible",
      className: "text-right font-medium tabular-nums",
      headerClassName: "text-right",
      cell: (row) =>
        row.availableAmount === null ? "" : formatAmount(row.availableAmount),
    },
  ];
}

const movementFacetedFilters: DataTableFacetedFilter[] = [
  {
    id: "tipo",
    label: "Tipo",
    options: [
      { label: movementKindLabels.payment, value: "pago" },
      { label: movementKindLabels.refund, value: "reembolso" },
    ],
    renderValue: (option) => (
      <Badge
        variant={getMovementKindBadgeVariant(
          option.value === "reembolso" ? "refund" : "payment",
        )}
      >
        {option.label}
      </Badge>
    ),
  },
  {
    id: "medio",
    label: "Medio",
    options: [...paymentMethodOptions],
    renderValue: (option) => {
      const method = paymentMethodValues.find(
        (value) => value === option.value,
      );

      return method ? (
        <Badge variant={getPaymentMethodBadgeVariant(method)}>
          {option.label}
        </Badge>
      ) : (
        option.label
      );
    },
  },
  {
    // The way down from the `Disponible` card: it reads the event's uncommitted
    // money, and this narrows the list to the payments where that money is.
    // `Sin disponible` is the mirror question —what is already fully applied—
    // and comes free. Refunds have no `Disponible`, so either value hides them.
    id: "disponible",
    label: "Disponible",
    options: [
      { label: "Con disponible", value: "con" },
      { label: "Sin disponible", value: "sin" },
    ],
  },
];

const emptyMovementsList = describeEmptyList(
  "movimientos",
  "search-and-filters",
);

export function MovementsListRouteView({
  loaderData,
}: MovementsListRouteViewProps) {
  // Lifted out of the table because it drives more than the table: every
  // metric card re-scopes to it. Selecting a few movements is how the
  // administrator asks what *those* came to without adding them up by hand.
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [openRefundId, setOpenRefundId] = useState<string | null>(null);
  const visibleRowKeys = loaderData.rows.map(movementRowKey).join(",");
  // Read from the revalidated rows, so a refund deleted meanwhile closes its
  // dialog.
  const openRefund = loaderData.rows.find(
    (row) => row.kind === "refund" && row.id === openRefundId,
  );
  const columns = useMemo(
    () => movementColumns({ onOpenRefund: setOpenRefundId }),
    [],
  );

  // The list is server-paginated, so a selection only ever reaches the page on
  // screen. Any navigation —page, search, facet, sort— sends a different set of
  // rows, and carrying the old ticks over would leave the cards summing rows
  // nobody can see. Clearing is the honest reading: the cards go back to the
  // event's whole position.
  useEffect(() => {
    setSelectedRowKeys([]);
  }, [visibleRowKeys]);

  const { availableAmount, netAmount, paymentsAmount, refundsAmount } =
    resolveSelectedMovementTotals({
      rows: loaderData.rows,
      selectedRowKeys,
      summary: loaderData.summary,
    });
  // The order and the page narrow nothing: a sort reorders the same rows, and
  // a page past the last one is clamped.
  const shouldShowTable =
    loaderData.rows.length > 0 ||
    loaderData.hasAnyMovement ||
    loaderData.filters.query.length > 0 ||
    loaderData.filters.availability !== null ||
    loaderData.filters.kind !== null ||
    loaderData.filters.method !== null;

  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title="Movimientos"
      description="Registrá pagos y consultá el dinero que entró y salió del evento."
      eventRequiredEmptyState={{
        title: "No hay un evento activo para revisar movimientos",
        description: "Activá un evento para ver y registrar movimientos.",
      }}
      action={
        loaderData.canWrite
          ? {
              label: "Nuevo pago",
              to: getCreatePaymentUrl(loaderData.selectedEventId),
            }
          : undefined
      }
      headerAction={
        loaderData.canWrite ? undefined : (
          <PeriodExportMenu
            description="La recaudación del evento activo en el período, por fecha: cada pago y cada reembolso, y los pagos por provincia y por modalidad. Dejá una fecha vacía para no acotar ese extremo."
            path={collectionExportPath}
            title="Exportar recaudación"
          />
        )
      }
    >
      <div className="flex flex-col gap-6">
        {/* The event's whole position, never the page's and never the filtered
            set: `Pagos`, `Reembolsos` and `Neto` are the workbook's three
            figures, and `Disponible` is read first and filtered on second,
            through the facet of the same name.

            A selection is the one thing that narrows them, and it narrows them
            on purpose: ticking rows is an explicit ask about *those* movements,
            unlike a filter, which is an ask about which rows to show. Untick
            everything and the event's position comes back.

            Outside the table's own emptiness on purpose. An event with no
            movements yet reads `$ 0` on every card, which is the answer to what
            has been collected — a card that disappears is one the administrator
            has to guess the value of. They go away only with the event, where
            there is no position to state. */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard title="Pagos" value={formatAmount(paymentsAmount)} />
          <MetricCard title="Reembolsos" value={formatAmount(refundsAmount)} />
          <MetricCard title="Neto" value={formatAmount(netAmount)} />
          <MetricCard
            title="Disponible"
            value={formatAmount(availableAmount)}
          />
        </section>

        {shouldShowTable ? (
          <ServerDataTable
            rows={loaderData.rows}
            columns={columns}
            facetedFilters={movementFacetedFilters}
            initialFacetedFilterValues={buildInitialFacetedFilterValues(
              loaderData,
            )}
            initialSearchValue={loaderData.filters.query}
            getRowKey={movementRowKey}
            selectableRows
            selectedRowIds={selectedRowKeys}
            onSelectedRowIdsChange={setSelectedRowKeys}
            searchPlaceholder="Buscar por academia o número"
            initialSort={loaderData.filters.order}
            emptyMessage={emptyMovementsList.nothingMatched}
            currentPage={loaderData.filters.page}
            totalPages={loaderData.totalPages}
            totalRows={loaderData.totalCount}
          />
        ) : (
          <AdminEmptyState
            icon={HandCoins}
            title={emptyMovementsList.nothingYet}
            description="Cuando registres un pago o un reembolso lo vas a poder revisar acá."
          />
        )}
      </div>
      {openRefund?.kind === "refund" ? (
        <EditRefundDialog
          key={openRefund.id}
          availableBalanceAmount={openRefund.ownerAvailableBalanceAmount}
          onOpenChange={(open) => {
            if (!open) {
              setOpenRefundId(null);
            }
          }}
          readOnly={!loaderData.canWrite}
          refund={openRefund}
        />
      ) : null}
    </AdminResourceLayout>
  );
}

function getCreatePaymentUrl(selectedEventId: string | null) {
  return selectedEventId
    ? `/administracion/movimientos/pagos/nuevo?evento=${selectedEventId}`
    : "/administracion/movimientos/pagos/nuevo";
}

function buildInitialFacetedFilterValues(
  loaderData: MovementsListLoaderData,
): Record<string, DataTableFacetedFilterValue> {
  const filters: DataTableFacetedFilterValue = {};

  if (loaderData.filters.kind !== null) {
    filters.tipo = loaderData.filters.kind === "refund" ? "reembolso" : "pago";
  }

  if (loaderData.filters.method !== null) {
    filters.medio = loaderData.filters.method;
  }

  if (loaderData.filters.availability !== null) {
    filters.disponible = loaderData.filters.availability;
  }

  return {
    filters,
  };
}
