import { HandCoins } from "lucide-react";

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
import { Badge } from "@/components/ui/badge";
import {
  formatAmount,
  formatDate,
} from "@/features/admin/academies/account-current/formatters";
import {
  formatPaymentMethodLabel,
  getPaymentMethodBadgeVariant,
  paymentMethodOptions,
} from "@/lib/finances/payment-methods";
import { formatPaymentNumber } from "@/lib/finances/payment-number";

import type { AdminPaymentRow, AdminPaymentsListLoaderData } from "./server";

type PaymentsLoaderData = AdminPaymentsListLoaderData;

type AdministracionPagosRouteViewProps = {
  loaderData: PaymentsLoaderData;
};

const paymentColumns: DataTableColumn<AdminPaymentRow>[] = [
  {
    id: "paymentNumber",
    header: "#",
    className: "font-medium tabular-nums",
    cell: (row) => (
      <DataTableLink to={`/administracion/pagos/${row.id}`}>
        {formatPaymentNumber(row.paymentNumber)}
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
    id: "amount",
    header: "Monto",
    className: "text-right tabular-nums",
    headerClassName: "text-right",
    cell: (row) => formatAmount(row.amount),
  },
];

const paymentFacetedFilters: DataTableFacetedFilter[] = [
  {
    id: "medio",
    label: "Medio de pago",
    options: [...paymentMethodOptions],
  },
];

export function AdministracionPagosRouteView({
  loaderData,
}: AdministracionPagosRouteViewProps) {
  const shouldShowTable =
    loaderData.rows.length > 0 ||
    loaderData.hasAnyPayment ||
    loaderData.filters.query.length > 0 ||
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
      {shouldShowTable ? (
        <ServerDataTable
          rows={loaderData.rows}
          columns={paymentColumns}
          pageParamName="pagina"
          searchParamName="busqueda"
          sortParamName="orden"
          facetedFilters={paymentFacetedFilters}
          initialFacetedFilterValues={buildInitialFacetedFilterValues(
            loaderData,
          )}
          initialSearchValue={loaderData.filters.query}
          getRowKey={(row) => row.id}
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

  return {
    filters,
  };
}
