import { CircleDollarSign, Landmark, Receipt } from "lucide-react";

import { AdminResourceLayout } from "@/components/admin/resource-layout";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { formatAmount } from "./formatters";
import {
  CorrectionActionsForm,
  DepositInvoiceForm,
  PaymentForm,
  PaymentImputationForm,
} from "./forms";
import {
  defaultAccountCurrentActionValues,
  type AdministrativeAcademyAccountCurrentActionData,
} from "./shared";
import {
  ActiveDepositInvoicesTable,
  ActiveImputationsTable,
  ActivePaymentsTable,
  MovementsTable,
} from "./tables";
import type { AccountCurrentLoaderData } from "./types";

type AdministracionAcademiaCuentaCorrienteRouteViewProps = {
  actionData?: AdministrativeAcademyAccountCurrentActionData;
  loaderData: AccountCurrentLoaderData;
};

export function AdministracionAcademiaCuentaCorrienteRouteView({
  actionData,
  loaderData,
}: AdministracionAcademiaCuentaCorrienteRouteViewProps) {
  const values = actionData?.values ?? defaultAccountCurrentActionValues();

  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title="Cuenta corriente"
      description={`Registrá pagos y revisá el saldo operativo de ${loaderData.academy.name} dentro del evento activo.`}
      eventRequiredEmptyState={{
        title: "Elegí un evento activo para revisar pagos",
        description:
          "Activá un evento para registrar pagos y consultar la cuenta corriente de la academia.",
      }}
    >
      <div className="flex flex-col gap-6">
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

        {actionData ? (
          <Alert variant="destructive">
            <AlertDescription>{actionData.message}</AlertDescription>
          </Alert>
        ) : null}

        {loaderData.canIssueInvoices ? (
          <DepositInvoiceForm
            candidates={loaderData.depositInvoiceCandidates}
            fieldErrors={actionData?.fieldErrors ?? {}}
            values={values.invoice}
          />
        ) : null}

        <ActiveDepositInvoicesTable
          invoices={loaderData.activeDepositInvoices}
        />

        {loaderData.canCorrectRecords ? (
          <CorrectionActionsForm
            fieldErrors={actionData?.fieldErrors ?? {}}
            invoices={loaderData.activeDepositInvoices.filter(
              (invoice) => invoice.imputedAmount === 0,
            )}
            imputations={loaderData.imputations}
            payments={loaderData.payments.filter(
              (payment) => payment.imputedAmount === 0,
            )}
            values={values.correction}
          />
        ) : null}

        {loaderData.canImputePayments &&
        loaderData.payments.some((payment) => payment.availableAmount > 0) &&
        loaderData.activeDepositInvoices.some(
          (invoice) => invoice.pendingAmount > 0,
        ) ? (
          <PaymentImputationForm
            fieldErrors={actionData?.fieldErrors ?? {}}
            invoices={loaderData.activeDepositInvoices.filter(
              (invoice) => invoice.pendingAmount > 0,
            )}
            payments={loaderData.payments.filter(
              (payment) => payment.availableAmount > 0,
            )}
            values={values.imputation}
          />
        ) : null}

        {loaderData.canRegisterPayments ? (
          <PaymentForm
            fieldErrors={actionData?.fieldErrors ?? {}}
            values={values.payment}
          />
        ) : null}

        <ActivePaymentsTable payments={loaderData.payments} />

        <ActiveImputationsTable imputations={loaderData.imputations} />

        <MovementsTable movements={loaderData.movements} />
      </div>
    </AdminResourceLayout>
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
