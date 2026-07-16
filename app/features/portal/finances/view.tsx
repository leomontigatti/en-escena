import { CircleDollarSign, Landmark, Receipt, WalletCards } from "lucide-react";

import { PortalEmptyState, PortalListPage } from "@/components/portal/ui";
import { MetricCard } from "@/components/shared/metric-card";
import { Badge } from "@/components/ui/badge";
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
  formatChoreographyFinancialState,
  formatDate,
  formatOperationalAmount,
} from "@/features/admin/academies/account-current/formatters";
import type { loadPortalAcademyFinances } from "@/features/portal/finances/server";
import { formatGroupTypeLabel } from "@/lib/portal/choreographies";
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
        title="Resumen"
        description="Consultá el estado de tu cuenta corriente dentro del evento."
      >
        <PortalEmptyState
          title="Todavía no hay un evento activo"
          description="Cuando administración active un evento, vas a poder consultar tu saldo, pagos y coreografías desde esta sección."
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
          value={formatOperationalAmount(loaderData.summary.owedBalanceAmount)}
        />
      </section>

      <PaymentsTable payments={loaderData.payments} />
      <ChoreographyFinanceTable rows={loaderData.choreographyFinanceRows} />
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
              <TableHead className="text-right">Asignado</TableHead>
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
                  {formatAmount(payment.allocatedAmount)}
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

function ChoreographyFinanceTable({
  rows,
}: {
  rows: PortalAcademyFinancesLoaderData["choreographyFinanceRows"];
}) {
  if (rows.length === 0) {
    return (
      <PortalEmptyState
        title="Todavía no hay coreografías"
        description="Cuando cargues coreografías en este evento, vas a ver acá su estado financiero."
        icon={<Receipt aria-hidden="true" />}
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Coreografías</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Tipo de grupo</TableHead>
              <TableHead className="text-right">Seña</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">{row.name}</TableCell>
                <TableCell>
                  <Badge variant="secondary">
                    {formatGroupTypeLabel(row.groupType)}
                  </Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatOperationalAmount(row.depositAmount)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatOperationalAmount(row.balanceAmount)}
                </TableCell>
                <TableCell>
                  {formatChoreographyFinancialState(row.financialState)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
