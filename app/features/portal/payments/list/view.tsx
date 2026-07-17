import { HandCoins } from "lucide-react";

import { PortalEmptyState, PortalListPage } from "@/components/portal/ui";
import {
  ClientDataTable,
  type DataTableColumn,
  type DataTableFacetedFilter,
} from "@/components/shared/data-table";
import { Badge } from "@/components/ui/badge";
import {
  formatAmount,
  formatDate,
} from "@/features/admin/academies/account-current/formatters";
import type { loadPortalAcademyPayments } from "@/features/portal/payments/list/server";
import {
  formatPaymentMethodLabel,
  getPaymentMethodBadgeVariant,
  paymentMethodOptions,
} from "@/lib/finances/payment-methods";
import { formatPaymentNumber } from "@/lib/finances/payment-number";

type PortalAcademyPaymentsLoaderData = Awaited<
  ReturnType<typeof loadPortalAcademyPayments>
>;

type PaymentRow = PortalAcademyPaymentsLoaderData["payments"][number];

const paymentFacetedFilters: DataTableFacetedFilter[] = [
  {
    id: "medio",
    label: "Medio de pago",
    options: [...paymentMethodOptions],
  },
];

const paymentColumns: DataTableColumn<PaymentRow>[] = [
  {
    id: "paymentNumber",
    header: "#",
    className: "font-medium tabular-nums",
    cell: (row) => formatPaymentNumber(row.paymentNumber),
  },
  {
    id: "paymentDate",
    header: "Fecha",
    cell: (row) => formatDate(row.paymentDate),
    sortValue: (row) => row.paymentDate,
  },
  {
    id: "reference",
    header: "Referencia",
    className: "min-w-56 text-muted-foreground",
    cell: (row) => row.reference ?? "",
    filterValue: (row) => `${row.reference ?? ""} ${row.paymentNumber}`,
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

export function PortalAcademyPaymentsRouteView({
  loaderData,
}: {
  loaderData: PortalAcademyPaymentsLoaderData;
}) {
  if (!loaderData.activeEvent) {
    return (
      <PortalListPage
        titleId="pagos-title"
        title="Pagos"
        description="Consultá los pagos que administración registró para tu academia."
      >
        <PortalEmptyState
          title="Todavía no hay un evento activo"
          description="Cuando administración active un evento, vas a poder consultar acá los pagos registrados."
          icon={<HandCoins aria-hidden="true" />}
        />
      </PortalListPage>
    );
  }

  if (loaderData.payments.length === 0) {
    return (
      <PortalListPage
        titleId="pagos-title"
        title="Pagos"
        description="Consultá los pagos que administración registró para tu academia."
      >
        <PortalEmptyState
          title="Todavía no hay pagos registrados"
          description="Cuando administración registre un pago de tu academia en este evento, lo vas a poder revisar acá."
          icon={<HandCoins aria-hidden="true" />}
        />
      </PortalListPage>
    );
  }

  return (
    <PortalListPage
      titleId="pagos-title"
      title="Pagos"
      description="Consultá los pagos que administración registró para tu academia."
    >
      <ClientDataTable
        rows={loaderData.payments}
        columns={paymentColumns}
        facetedFilters={paymentFacetedFilters}
        getRowKey={(row) => row.id}
        searchPlaceholder="Buscar pago por referencia o número"
        initialSort={{
          columnId: "paymentDate",
          direction: "desc",
        }}
        emptyMessage="No hay pagos para mostrar."
      />
    </PortalListPage>
  );
}
