import { AdminEmptyState } from "@/components/admin/resource-layout";
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
import { formatPaymentMethodLabel } from "@/lib/finances/payment-methods";
import { Landmark } from "lucide-react";

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

export function ActivePaymentsTable({
  payments,
}: {
  payments: AccountCurrentLoaderData["payments"];
}) {
  if (payments.length === 0) {
    return (
      <AdminEmptyState
        icon={Landmark}
        title="Todavía no hay pagos registrados."
        description="Cuando administración registre pagos para esta academia, los vas a poder revisar acá junto con el saldo disponible."
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
              <TableHead>Nota interna</TableHead>
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
                <TableCell>{payment.internalNote ?? ""}</TableCell>
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

export function ActiveImputationsTable({
  imputations,
}: {
  imputations: AccountCurrentLoaderData["imputations"];
}) {
  if (imputations.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Imputaciones activas</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Pago</TableHead>
              <TableHead>Factura</TableHead>
              <TableHead>Coreografía</TableHead>
              <TableHead className="text-right">Monto</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {imputations.map((imputation) => (
              <TableRow key={imputation.id}>
                <TableCell>{formatDate(imputation.imputationDate)}</TableCell>
                <TableCell>{`N° ${imputation.paymentNumber}`}</TableCell>
                <TableCell>{`N° ${imputation.invoiceNumber}`}</TableCell>
                <TableCell>{imputation.choreographyName}</TableCell>
                <TableCell className="text-right">
                  {formatAmount(imputation.amount)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function MovementsTable({
  movements,
}: {
  movements: AccountCurrentLoaderData["movements"];
}) {
  if (movements.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Movimientos</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Movimiento</TableHead>
              <TableHead>Detalle</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Motivo</TableHead>
              <TableHead className="text-right">Importe</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {movements.map((movement) => (
              <TableRow key={movement.key}>
                <TableCell>{formatDate(movement.occurredOn)}</TableCell>
                <TableCell className="font-medium">{movement.label}</TableCell>
                <TableCell>{movement.detail}</TableCell>
                <TableCell>{movement.actorEmail}</TableCell>
                <TableCell>{movement.reason ?? ""}</TableCell>
                <TableCell className="text-right">
                  {formatAmount(movement.amount)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
