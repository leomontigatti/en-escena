import { CircleDollarSign, Landmark, Receipt } from "lucide-react";

import { AdminResourceLayout } from "@/components/admin/resource-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useServerActionToast } from "@/lib/shared/toasts";

import { formatAmount } from "./formatters";
import {
  BalanceInvoiceForm,
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
  ActiveBalanceInvoicesTable,
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
  const preview =
    actionData?.status === "preview" ? actionData.preview : undefined;
  const pendingInvoices = [
    ...loaderData.activeDepositInvoices,
    ...loaderData.activeBalanceInvoices,
  ].filter((invoice) => invoice.pendingAmount > 0);

  useServerActionToast(actionData?.status === "error" ? actionData : null);

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

        {loaderData.canIssueInvoices ? (
          <DepositInvoiceForm
            candidates={loaderData.depositInvoiceCandidates}
            values={values.invoice}
          />
        ) : null}

        {loaderData.canIssueInvoices ? (
          <BalanceInvoiceForm
            candidates={loaderData.balanceInvoiceCandidates}
            preview={preview}
            values={values.balanceInvoice}
          />
        ) : null}

        <ActiveDepositInvoicesTable
          invoices={loaderData.activeDepositInvoices}
        />
        <ActiveBalanceInvoicesTable
          invoices={loaderData.activeBalanceInvoices}
        />

        {loaderData.canCorrectRecords ? (
          <CorrectionActionsForm
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
        pendingInvoices.length > 0 ? (
          <PaymentImputationForm
            invoices={pendingInvoices}
            payments={loaderData.payments.filter(
              (payment) => payment.availableAmount > 0,
            )}
            values={values.imputation}
          />
        ) : null}

        {loaderData.canRegisterPayments ? (
          <PaymentForm values={values.payment} />
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
