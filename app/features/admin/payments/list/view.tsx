import { HandCoins } from "lucide-react";
import { useEffect, useState } from "react";

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
import { formatAmount, formatDate } from "@/lib/finances/formatters";
import {
  formatPaymentMethodLabel,
  getPaymentMethodBadgeVariant,
  paymentMethodOptions,
} from "@/lib/finances/payment-methods";
import { formatEventSequenceNumber } from "@/lib/events/sequence-number";
import { resolveSelectedPaymentTotals } from "@/lib/finances/selected-payment-totals";

import type { PaymentsListRow, PaymentsListLoaderData } from "./server";

type PaymentsLoaderData = PaymentsListLoaderData;

type PaymentsListRouteViewProps = {
  loaderData: PaymentsLoaderData;
};

const paymentColumns: DataTableColumn<PaymentsListRow>[] = [
  {
    id: "paymentNumber",
    header: "#",
    className: "font-medium tabular-nums",
    cell: (row) => (
      <DataTableLink to={`/administracion/pagos/${row.id}`}>
        {formatEventSequenceNumber(row.paymentNumber)}
      </DataTableLink>
    ),
  },
  {
    id: "paymentDate",
    header: "Fecha",
    cell: (row) => formatDate(row.paymentDate),
    sortValue: (row) => row.paymentDate,
  },
  {
    id: "academyName",
    header: "Academia",
    className: "min-w-56 text-muted-foreground",
    cell: (row) => row.academyName,
    filterValue: (row) => `${row.academyName} ${row.paymentNumber}`,
  },
  {
    id: "paymentMethod",
    header: "Medio de pago",
    cell: (row) => (
      <Badge variant={getPaymentMethodBadgeVariant(row.paymentMethod)}>
        {formatPaymentMethodLabel(row.paymentMethod)}
      </Badge>
    ),
    filterValue: (row) => row.paymentMethod,
  },
  {
    // Muted, like `Total` on the finance lists: it is the context the remainder
    // is read against —what came in— and not the figure with something left to
    // do on it.
    id: "amount",
    header: "Monto",
    className: "text-right tabular-nums text-muted-foreground",
    headerClassName: "text-right",
    cell: (row) => formatAmount(row.amount),
  },
  {
    // The row's actionable figure, emphasised by column: money received and not
    // yet committed to any inscription. `$ 0` and not a dash on a fully applied
    // payment — a zero here is an answer.
    id: "availableAmount",
    header: "Disponible",
    className: "text-right font-medium tabular-nums",
    headerClassName: "text-right",
    cell: (row) => formatAmount(row.availableAmount),
  },
];

const paymentFacetedFilters: DataTableFacetedFilter[] = [
  {
    id: "medio",
    label: "Medio de pago",
    options: [...paymentMethodOptions],
  },
  {
    // The way down from the `Disponible` card: it reads the event's uncommitted
    // money, and this narrows the list to where that money is. `Sin disponible`
    // is the mirror question —what is already fully applied— and comes free.
    id: "disponible",
    label: "Disponible",
    options: [
      { label: "Con disponible", value: "con" },
      { label: "Sin disponible", value: "sin" },
    ],
  },
];

export function PaymentsListRouteView({
  loaderData,
}: PaymentsListRouteViewProps) {
  // Lifted out of the table because it drives more than the table: both metric
  // cards re-scope to it. Selecting a few payments is how the administrator asks
  // what *those* came to without adding them up by hand. The academy portal's
  // payment list does not select: it reads its own payments and has nothing to
  // re-scope.
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const visibleRowIds = loaderData.rows.map((row) => row.id).join(",");

  // The list is server-paginated, so a selection only ever reaches the page on
  // screen. Any navigation —page, search, facet, sort— sends a different set of
  // rows, and carrying the old ticks over would leave the cards summing rows
  // nobody can see. Clearing is the honest reading: the cards go back to the
  // event's whole position.
  useEffect(() => {
    setSelectedRowIds([]);
  }, [visibleRowIds]);

  const { availableAmount, totalAmount } = resolveSelectedPaymentTotals({
    rows: loaderData.rows,
    selectedRowIds,
    summary: loaderData.summary,
  });
  const shouldShowTable =
    loaderData.rows.length > 0 ||
    loaderData.hasAnyPayment ||
    loaderData.filters.query.length > 0 ||
    loaderData.filters.availability !== null ||
    loaderData.filters.method !== null ||
    loaderData.filters.page > 1 ||
    loaderData.filters.order.direction !== "desc";

  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title="Pagos"
      description="Registrá y consultá los distintos pagos recibidos."
      eventRequiredEmptyState={{
        title: "No hay un evento activo para revisar pagos",
        description: "Activá un evento para ver y registrar pagos.",
      }}
      action={{
        label: "Nuevo pago",
        to: getCreatePaymentUrl(loaderData.selectedEventId),
      }}
    >
      <div className="flex flex-col gap-6">
        {/* The event's whole position, never the page's and never the filtered
            set: `Disponible` is read first and filtered on second, through the
            facet of the same name.

            A selection is the one thing that narrows them, and it narrows them
            on purpose: ticking rows is an explicit ask about *those* payments,
            unlike a filter, which is an ask about which rows to show. Untick
            everything and the event's position comes back.

            Outside the table's own emptiness on purpose. An event with no
            payments yet reads `$ 0` twice, which is the answer to what has been
            collected — a card that disappears is one the administrator has to
            guess the value of. They go away only with the event, where there is
            no position to state. */}
        <section className="grid gap-4 sm:grid-cols-2">
          <MetricCard title="Total cobrado" value={formatAmount(totalAmount)} />
          <MetricCard
            title="Disponible"
            value={formatAmount(availableAmount)}
          />
        </section>

        {shouldShowTable ? (
          <ServerDataTable
            rows={loaderData.rows}
            columns={paymentColumns}
            facetedFilters={paymentFacetedFilters}
            initialFacetedFilterValues={buildInitialFacetedFilterValues(
              loaderData,
            )}
            initialSearchValue={loaderData.filters.query}
            getRowKey={(row) => row.id}
            selectableRows
            selectedRowIds={selectedRowIds}
            onSelectedRowIdsChange={setSelectedRowIds}
            searchPlaceholder="Buscar pago por academia o número"
            initialSort={loaderData.filters.order}
            emptyMessage="No hay pagos para mostrar."
            currentPage={loaderData.filters.page}
            totalPages={loaderData.totalPages}
            totalRows={loaderData.totalCount}
          />
        ) : (
          <AdminEmptyState
            icon={HandCoins}
            title="Todavía no hay pagos registrados."
            description="Cuando registres un pago lo vas a poder revisar acá."
          />
        )}
      </div>
    </AdminResourceLayout>
  );
}

function getCreatePaymentUrl(selectedEventId: string | null) {
  return selectedEventId
    ? `/administracion/pagos/nuevo?evento=${selectedEventId}`
    : "/administracion/pagos/nuevo";
}

function buildInitialFacetedFilterValues(
  loaderData: PaymentsLoaderData,
): Record<string, DataTableFacetedFilterValue> {
  const filters: DataTableFacetedFilterValue = {};

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
