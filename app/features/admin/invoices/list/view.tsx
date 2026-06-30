import { FileText, Landmark } from "lucide-react";
import { Link } from "react-router";

import {
  AdminEmptyState,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import {
  ClientDataTable,
  type DataTableColumn,
  type DataTableFacetedFilter,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  formatAmount,
  formatDate,
  formatInvoiceState,
} from "@/features/admin/academies/account-current/formatters";

import type { AdminInvoiceRow, loadAdminInvoicesList } from "./server";

type InvoicesLoaderData = Awaited<ReturnType<typeof loadAdminInvoicesList>>;

type AdministracionFacturasRouteViewProps = {
  loaderData: InvoicesLoaderData;
};

const invoiceColumns: DataTableColumn<AdminInvoiceRow>[] = [
  {
    id: "invoiceNumber",
    header: "N°",
    className: "font-medium tabular-nums",
    cell: (row) => row.invoiceNumber,
    sortValue: (row) => row.invoiceNumber,
  },
  {
    id: "issueDate",
    header: "Fecha",
    cell: (row) => formatDate(row.issueDate),
    sortValue: (row) => row.issueDate,
  },
  {
    id: "academyName",
    header: "Academia",
    className: "min-w-56 font-medium",
    cell: (row) => (
      <DataTableLink to={`/administracion/academias/${row.academyId}`}>
        {row.academyName}
      </DataTableLink>
    ),
    filterValue: (row) =>
      `${row.academyName} ${row.choreographyName} ${row.invoiceNumber}`,
    sortValue: (row) => row.academyName,
  },
  {
    id: "choreographyName",
    header: "Coreografía",
    cell: (row) => row.choreographyName,
    filterValue: (row) => row.choreographyName,
    sortValue: (row) => row.choreographyName,
  },
  {
    id: "invoiceType",
    header: "Tipo",
    cell: (row) => formatInvoiceType(row.invoiceType),
    filterValue: (row) => row.invoiceType,
    sortValue: (row) => row.invoiceType,
  },
  {
    id: "status",
    header: "Estado",
    cell: (row) => <InvoiceStatusBadge status={row.status} />,
    filterValue: (row) => row.status,
    sortValue: (row) => row.status,
  },
  {
    id: "imputedAmount",
    header: "Imputado",
    className: "text-right tabular-nums",
    headerClassName: "text-right",
    cell: (row) => formatAmount(row.imputedAmount),
    sortValue: (row) => row.imputedAmount,
  },
  {
    id: "pendingAmount",
    header: "Pendiente",
    className: "text-right tabular-nums",
    headerClassName: "text-right",
    cell: (row) => formatAmount(row.pendingAmount),
    sortValue: (row) => row.pendingAmount,
  },
  {
    id: "amount",
    header: "Importe",
    className: "text-right tabular-nums",
    headerClassName: "text-right",
    cell: (row) => formatAmount(row.amount),
    sortValue: (row) => row.amount,
  },
];

const invoiceFacetedFilters: DataTableFacetedFilter[] = [
  {
    label: "Estado",
    options: [
      { label: "Pendiente", value: "pendiente" },
      { label: "Parcial", value: "parcial" },
      { label: "Pagada", value: "pagada" },
      { label: "Cancelada", value: "cancelada" },
    ],
  },
  {
    label: "Tipo",
    options: [
      { label: "Seña", value: "sena" },
      { label: "Saldo", value: "saldo" },
    ],
  },
];

export function AdministracionFacturasRouteView({
  loaderData,
}: AdministracionFacturasRouteViewProps) {
  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title="Facturas"
      description="Consultá facturas emitidas, estado, importes imputados y saldos pendientes del evento activo."
      eventRequiredEmptyState={{
        title: "No hay un evento activo para revisar facturas",
        description: "Activá un evento para ver y emitir facturas.",
      }}
      headerAction={
        <Button asChild>
          <Link to="/administracion/finanzas">
            <Landmark aria-hidden="true" data-icon />
            Ver cuentas corrientes
          </Link>
        </Button>
      }
    >
      {loaderData.rows.length > 0 ? (
        <ClientDataTable
          rows={loaderData.rows}
          columns={invoiceColumns}
          facetedFilters={invoiceFacetedFilters}
          getRowKey={(row) => row.id}
          searchPlaceholder="Buscar factura por academia, coreografía o número"
          textFilterColumnId="academyName"
          initialSort={{
            columnId: "issueDate",
            direction: "desc",
          }}
          emptyMessage="No hay facturas para mostrar."
        />
      ) : (
        <AdminEmptyState
          icon={FileText}
          title="Todavía no hay facturas emitidas."
          description="Cuando administración emita facturas para el evento activo, las vas a poder revisar acá."
        />
      )}
    </AdminResourceLayout>
  );
}

function InvoiceStatusBadge({ status }: { status: AdminInvoiceRow["status"] }) {
  if (status === "cancelada") {
    return <Badge variant="secondary">Cancelada</Badge>;
  }

  const variant =
    status === "pagada" ? "success" : status === "parcial" ? "info" : "warning";

  return <Badge variant={variant}>{formatInvoiceState(status)}</Badge>;
}

function formatInvoiceType(type: AdminInvoiceRow["invoiceType"]) {
  switch (type) {
    case "sena":
      return "Seña";
    case "saldo":
      return "Saldo";
  }
}
