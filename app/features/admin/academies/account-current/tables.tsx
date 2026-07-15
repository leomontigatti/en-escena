import {
  ReadOnlyTableCard,
  type ReadOnlyTableColumn,
} from "@/components/shared/read-only-table-card";

import {
  formatAmount,
  formatChoreographyFinancialState,
  formatDate,
  formatInvoiceState,
} from "./formatters";
import type { AccountCurrentLoaderData } from "./types";

type ActiveDepositInvoice =
  AccountCurrentLoaderData["activeDepositInvoices"][number];
type ActiveBalanceInvoice =
  AccountCurrentLoaderData["activeBalanceInvoices"][number];

const activeDepositInvoiceColumns: ReadOnlyTableColumn<ActiveDepositInvoice>[] =
  [
    {
      id: "invoiceNumber",
      header: "Factura",
      cellClassName: "font-medium",
      render: (invoice) => `N° ${invoice.invoiceNumber}`,
    },
    {
      id: "choreographyName",
      header: "Coreografía",
      render: (invoice) => invoice.choreographyName,
    },
    {
      id: "choreographyFinancialState",
      header: "Estado financiero",
      render: (invoice) =>
        formatChoreographyFinancialState(invoice.choreographyFinancialState),
    },
    {
      id: "status",
      header: "Estado factura",
      render: (invoice) => formatInvoiceState(invoice.status),
    },
    {
      id: "issueDate",
      header: "Fecha",
      render: (invoice) => formatDate(invoice.issueDate),
    },
    {
      id: "selectedPaymentDeadline",
      header: "Vence",
      render: (invoice) =>
        invoice.selectedPaymentDeadline
          ? formatDate(invoice.selectedPaymentDeadline)
          : "Sin vencimiento",
    },
    {
      id: "imputedAmount",
      header: "Imputado",
      headerClassName: "text-right",
      cellClassName: "text-right",
      render: (invoice) => formatAmount(invoice.imputedAmount),
    },
    {
      id: "pendingAmount",
      header: "Pendiente",
      headerClassName: "text-right",
      cellClassName: "text-right",
      render: (invoice) => formatAmount(invoice.pendingAmount),
    },
    {
      id: "amount",
      header: "Importe",
      headerClassName: "text-right",
      cellClassName: "text-right",
      render: (invoice) => formatAmount(invoice.amount),
    },
  ];

const activeBalanceInvoiceColumns: ReadOnlyTableColumn<ActiveBalanceInvoice>[] =
  [
    {
      id: "invoiceNumber",
      header: "Factura",
      cellClassName: "font-medium",
      render: (invoice) => `N° ${invoice.invoiceNumber}`,
    },
    {
      id: "choreographyName",
      header: "Coreografía",
      render: (invoice) => invoice.choreographyName,
    },
    {
      id: "choreographyFinancialState",
      header: "Estado financiero",
      render: (invoice) =>
        formatChoreographyFinancialState(invoice.choreographyFinancialState),
    },
    {
      id: "status",
      header: "Estado factura",
      render: (invoice) => formatInvoiceState(invoice.status),
    },
    {
      id: "issueDate",
      header: "Fecha",
      render: (invoice) => formatDate(invoice.issueDate),
    },
    {
      id: "discountLabel",
      header: "Detalle",
      render: (invoice) =>
        invoice.administrativeDiscountPublicLabel ?? "Descuento administrativo",
    },
    {
      id: "totalDiscountAmount",
      header: "Descuento",
      headerClassName: "text-right",
      cellClassName: "text-right",
      render: (invoice) => formatAmount(invoice.totalDiscountAmount ?? 0),
    },
    {
      id: "finalTotalAmount",
      header: "Total final",
      headerClassName: "text-right",
      cellClassName: "text-right",
      render: (invoice) => formatAmount(invoice.finalTotalAmount ?? 0),
    },
    {
      id: "pendingAmount",
      header: "Pendiente",
      headerClassName: "text-right",
      cellClassName: "text-right",
      render: (invoice) => formatAmount(invoice.pendingAmount),
    },
    {
      id: "amount",
      header: "Importe",
      headerClassName: "text-right",
      cellClassName: "text-right",
      render: (invoice) => formatAmount(invoice.amount),
    },
  ];

export function ActiveDepositInvoicesTable({
  invoices,
}: {
  invoices: AccountCurrentLoaderData["activeDepositInvoices"];
}) {
  return (
    <ReadOnlyTableCard
      columns={activeDepositInvoiceColumns}
      getRowKey={(invoice) => invoice.id}
      rows={invoices}
      title="Facturas de seña activas"
    />
  );
}

export function ActiveBalanceInvoicesTable({
  invoices,
}: {
  invoices: AccountCurrentLoaderData["activeBalanceInvoices"];
}) {
  return (
    <ReadOnlyTableCard
      columns={activeBalanceInvoiceColumns}
      getRowKey={(invoice) => invoice.id}
      rows={invoices}
      title="Facturas de saldo activas"
    />
  );
}
