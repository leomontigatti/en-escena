import { CircleDollarSign, Landmark, Receipt, WalletCards } from "lucide-react";

import { PortalEmptyState, PortalListPage } from "@/components/portal/ui";
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
} from "@/features/admin/academies/account-current/formatters";
import type { loadPortalAcademyFinances } from "@/features/portal/finances/server";
import { formatPaymentMethodLabel } from "@/lib/finances/payment-methods";

type PortalAcademyFinancesLoaderData = Awaited<
  ReturnType<typeof loadPortalAcademyFinances>
>;

export function PortalAcademyFinancesRouteView({
  loaderData,
}: {
  loaderData: PortalAcademyFinancesLoaderData;
}) {
  if (!loaderData.activeEvent) {
    return (
      <PortalListPage
        titleId="finanzas-title"
        title="Finanzas"
        description="Consultá el estado financiero de tu academia dentro del Evento activo."
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
      title="Finanzas"
      description={`Consultá el estado financiero de ${loaderData.activeEvent.name} con saldo disponible, saldo adeudado, pagos activos y facturas activas.`}
    >
      <section className="grid gap-4 md:grid-cols-3">
        <SummaryCard
          title="Monto total pagado"
          icon={Receipt}
          value={formatAmount(loaderData.summary.totalPaidAmount)}
        />
        <SummaryCard
          title="Saldo disponible"
          icon={CircleDollarSign}
          value={formatAmount(loaderData.summary.availableBalanceAmount)}
        />
        <SummaryCard
          title="Saldo adeudado"
          icon={Landmark}
          value={formatAmount(loaderData.summary.owedAmount)}
        />
      </section>

      <PaymentsTable payments={loaderData.payments} />
      <DepositInvoicesTable invoices={loaderData.activeDepositInvoices} />
      <BalanceInvoicesTable invoices={loaderData.activeBalanceInvoices} />
    </PortalListPage>
  );
}

function SummaryCard({
  icon: Icon,
  title,
  value,
}: {
  icon: typeof Receipt;
  title: string;
  value: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tracking-tight">{value}</p>
      </CardContent>
    </Card>
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
  if (invoices.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Facturas de seña activas</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Factura</TableHead>
              <TableHead>Coreografía</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead className="text-right">Imputado</TableHead>
              <TableHead className="text-right">Pendiente</TableHead>
              <TableHead className="text-right">Importe</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((invoice) => (
              <TableRow key={invoice.id}>
                <TableCell className="font-medium">
                  {`N° ${invoice.invoiceNumber}`}
                </TableCell>
                <TableCell>{invoice.choreographyName}</TableCell>
                <TableCell>{formatInvoiceState(invoice.status)}</TableCell>
                <TableCell>{formatDate(invoice.issueDate)}</TableCell>
                <TableCell className="text-right">
                  {formatAmount(invoice.imputedAmount)}
                </TableCell>
                <TableCell className="text-right">
                  {formatAmount(invoice.pendingAmount)}
                </TableCell>
                <TableCell className="text-right">
                  {formatAmount(invoice.amount)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function BalanceInvoicesTable({
  invoices,
}: {
  invoices: PortalAcademyFinancesLoaderData["activeBalanceInvoices"];
}) {
  if (invoices.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Facturas de saldo activas</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Factura</TableHead>
              <TableHead>Coreografía</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Descuento</TableHead>
              <TableHead className="text-right">Monto descuento</TableHead>
              <TableHead className="text-right">Pendiente</TableHead>
              <TableHead className="text-right">Importe</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((invoice) => (
              <TableRow key={invoice.id}>
                <TableCell className="font-medium">
                  {`N° ${invoice.invoiceNumber}`}
                </TableCell>
                <TableCell>{invoice.choreographyName}</TableCell>
                <TableCell>{formatInvoiceState(invoice.status)}</TableCell>
                <TableCell>{formatDate(invoice.issueDate)}</TableCell>
                <TableCell>
                  {invoice.administrativeDiscountPublicLabel ??
                    "Descuento administrativo"}
                </TableCell>
                <TableCell className="text-right">
                  {formatAmount(invoice.administrativeDiscountAmount ?? 0)}
                </TableCell>
                <TableCell className="text-right">
                  {formatAmount(invoice.pendingAmount)}
                </TableCell>
                <TableCell className="text-right">
                  {formatAmount(invoice.amount)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
