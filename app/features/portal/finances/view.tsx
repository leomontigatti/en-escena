import { CircleDollarSign, Landmark, Receipt, WalletCards } from "lucide-react";

import { PortalEmptyState, PortalListPage } from "@/components/portal/ui";
import { MetricCard } from "@/components/shared/metric-card";
import {
  ReadOnlyTableCard,
  type ReadOnlyTableColumn,
} from "@/components/shared/read-only-table-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatAmount,
  formatDate,
  formatInvoiceState,
  formatOperationalAmount,
} from "@/features/admin/academies/account-current/formatters";
import type { loadPortalAcademyFinances } from "@/features/portal/finances/server";
import { formatPaymentMethodLabel } from "@/lib/finances/payment-methods";

type PortalAcademyFinancesLoaderData = Awaited<
  ReturnType<typeof loadPortalAcademyFinances>
>;
type PortalDepositInvoice =
  PortalAcademyFinancesLoaderData["activeDepositInvoices"][number];
type PortalBalanceInvoice =
  PortalAcademyFinancesLoaderData["activeBalanceInvoices"][number];

const portalDepositInvoiceColumns: ReadOnlyTableColumn<PortalDepositInvoice>[] =
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
      id: "status",
      header: "Estado",
      render: (invoice) => formatInvoiceState(invoice.status),
    },
    {
      id: "issueDate",
      header: "Fecha",
      render: (invoice) => formatDate(invoice.issueDate),
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

const portalBalanceInvoiceColumns: ReadOnlyTableColumn<PortalBalanceInvoice>[] =
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
      id: "status",
      header: "Estado",
      render: (invoice) => formatInvoiceState(invoice.status),
    },
    {
      id: "issueDate",
      header: "Fecha",
      render: (invoice) => formatDate(invoice.issueDate),
    },
    {
      id: "discountLabel",
      header: "Descuento",
      render: (invoice) =>
        invoice.administrativeDiscountPublicLabel ?? "Descuento administrativo",
    },
    {
      id: "administrativeDiscountAmount",
      header: "Monto descuento",
      headerClassName: "text-right",
      cellClassName: "text-right",
      render: (invoice) =>
        formatAmount(invoice.administrativeDiscountAmount ?? 0),
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

export function PortalAcademyFinancesRouteView({
  loaderData,
}: {
  loaderData: PortalAcademyFinancesLoaderData;
}) {
  if (!loaderData.activeEvent) {
    return (
      <PortalListPage
        titleId="finanzas-title"
        title="Resumen"
        description="Consultá el estado de tu cuenta corriente dentro del evento."
      >
        <PortalEmptyState
          title="Todavía no hay un evento activo"
          description="Cuando administración active un evento, vas a poder consultar tu saldo, pagos y facturas desde esta sección."
          icon={<WalletCards aria-hidden="true" />}
        />
      </PortalListPage>
    );
  }

  return (
    <PortalListPage
      titleId="finanzas-title"
      title="Resumen"
      description={`Consultá el estado de tu cuenta corriente dentro del evento.`}
    >
      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard
          title="Seña adeudada"
          icon={Receipt}
          value={formatOperationalAmount(loaderData.summary.owedDepositAmount)}
        />
        <MetricCard
          title="Saldo disponible"
          icon={CircleDollarSign}
          value={formatAmount(loaderData.summary.availableBalanceAmount)}
        />
        <MetricCard
          title="Saldo adeudado"
          icon={Landmark}
          value={formatOperationalAmount(loaderData.summary.owedAmount)}
        />
      </section>

      <PaymentsTable payments={loaderData.payments} />
      <DepositInvoicesTable invoices={loaderData.activeDepositInvoices} />
      <BalanceInvoicesTable invoices={loaderData.activeBalanceInvoices} />
    </PortalListPage>
  );
}

function PaymentsTable({
  payments,
}: {
  payments: PortalAcademyFinancesLoaderData["payments"];
}) {
  if (payments.length === 0) {
    return (
      <PortalEmptyState
        title="Todavía no hay pagos activos"
        description="Cuando administración registre pagos para tu academia en este evento, vas a poder revisarlos acá."
        icon={<Receipt aria-hidden="true" />}
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pagos activos</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>N°</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Medio</TableHead>
              <TableHead>Referencia</TableHead>
              <TableHead className="text-right">Imputado</TableHead>
              <TableHead className="text-right">Disponible</TableHead>
              <TableHead className="text-right">Monto</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.map((payment) => (
              <TableRow key={payment.id}>
                <TableCell className="font-medium">
                  {payment.paymentNumber}
                </TableCell>
                <TableCell>{formatDate(payment.paymentDate)}</TableCell>
                <TableCell>
                  {formatPaymentMethodLabel(payment.paymentMethod)}
                </TableCell>
                <TableCell>{payment.reference ?? ""}</TableCell>
                <TableCell className="text-right">
                  {formatAmount(payment.imputedAmount)}
                </TableCell>
                <TableCell className="text-right">
                  {formatAmount(payment.availableAmount)}
                </TableCell>
                <TableCell className="text-right">
                  {formatAmount(payment.amount)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function DepositInvoicesTable({
  invoices,
}: {
  invoices: PortalAcademyFinancesLoaderData["activeDepositInvoices"];
}) {
  return (
    <ReadOnlyTableCard
      columns={portalDepositInvoiceColumns}
      getRowKey={(invoice) => invoice.id}
      rows={invoices}
      title="Facturas de seña activas"
    />
  );
}

function BalanceInvoicesTable({
  invoices,
}: {
  invoices: PortalAcademyFinancesLoaderData["activeBalanceInvoices"];
}) {
  return (
    <ReadOnlyTableCard
      columns={portalBalanceInvoiceColumns}
      getRowKey={(invoice) => invoice.id}
      rows={invoices}
      title="Facturas de saldo activas"
    />
  );
}
