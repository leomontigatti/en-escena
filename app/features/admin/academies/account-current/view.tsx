import { useState } from "react";

import { CircleDollarSign, Landmark, Receipt } from "lucide-react";

import { AdminResourceLayout } from "@/components/admin/resource-layout";
import {
  ClientDataTable,
  type DataTableColumn,
  type DataTableFacetedFilter,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import { MetricCard } from "@/components/shared/metric-card";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { formatGroupTypeLabel } from "@/lib/portal/choreographies";
import { useServerActionToast } from "@/lib/shared/toasts";

import {
  formatAmount,
  formatChoreographyFinancialState,
  formatOperationalAmount,
} from "./formatters";
import {
  CorrectionActionsForm,
  PaymentForm,
  PaymentImputationForm,
} from "./forms";
import {
  defaultAccountCurrentActionValues,
  paymentFieldNames,
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

type ChoreographyFinanceRow =
  AccountCurrentLoaderData["choreographyFinanceRows"][number];

const choreographyFinanceFacetedFilters: DataTableFacetedFilter[] = [
  {
    id: "estado",
    label: "Estado",
    options: [
      { label: "Impaga", value: "impaga" },
      { label: "Señada", value: "señada" },
      { label: "Pagada", value: "pagada" },
    ],
  },
];

type AdministracionAcademiaCuentaCorrienteRouteViewProps = {
  actionData?: AdministrativeAcademyAccountCurrentActionData;
  loaderData: AccountCurrentLoaderData;
};

export function AdministracionAcademiaCuentaCorrienteRouteView({
  actionData,
  loaderData,
}: AdministracionAcademiaCuentaCorrienteRouteViewProps) {
  const values = actionData?.values ?? defaultAccountCurrentActionValues();
  const [isPaymentFormOpen, setIsPaymentFormOpen] = useState(false);
  const pendingInvoices = [
    ...loaderData.activeDepositInvoices,
    ...loaderData.activeBalanceInvoices,
  ].filter((invoice) => invoice.pendingAmount > 0);
  const shouldShowPaymentForm =
    loaderData.canRegisterPayments &&
    (isPaymentFormOpen || hasPaymentActionErrors(actionData));

  useServerActionToast(actionData?.status === "error" ? actionData : null);

  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title="Cuenta corriente"
      description="Revisá la cuenta corriente, emití facturas y registrá pagos para una academia."
      headerAction={
        loaderData.canRegisterPayments ? (
          <AccountCurrentActionsMenu
            onRegisterPayment={() => setIsPaymentFormOpen(true)}
          />
        ) : null
      }
      eventRequiredEmptyState={{
        title: "Elegí un evento activo para revisar pagos",
        description:
          "Activá un evento para registrar pagos y consultar la cuenta corriente de la academia.",
      }}
    >
      <div className="flex flex-col gap-6">
        <section className="grid gap-4 md:grid-cols-3">
          <MetricCard
            title="Seña adeudada"
            icon={Receipt}
            value={formatOperationalAmount(
              loaderData.summary.owedDepositAmount,
            )}
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

        <ClientDataTable
          rows={loaderData.choreographyFinanceRows}
          columns={buildChoreographyFinanceColumns(loaderData.academy.id)}
          facetedFilters={choreographyFinanceFacetedFilters}
          getRowKey={(row) => row.id}
          searchPlaceholder="Buscar coreografía por nombre"
          selectableRows
          textFilterColumnId="name"
          initialSort={{
            columnId: "name",
            direction: "asc",
          }}
          emptyMessage="No hay coreografías para mostrar."
        />

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

        {shouldShowPaymentForm ? <PaymentForm values={values.payment} /> : null}

        <ActivePaymentsTable payments={loaderData.payments} />

        <ActiveImputationsTable imputations={loaderData.imputations} />

        <MovementsTable movements={loaderData.movements} />
      </div>
    </AdminResourceLayout>
  );
}

function buildChoreographyFinanceColumns(
  academyId: string,
): DataTableColumn<ChoreographyFinanceRow>[] {
  return [
    {
      id: "name",
      header: "Nombre",
      className: "min-w-56 font-medium",
      cell: (row) => (
        <DataTableLink
          to={`/administracion/finanzas/${academyId}/coreografias/${row.id}`}
        >
          {row.name}
        </DataTableLink>
      ),
      filterValue: (row) => row.name,
      sortValue: (row) => row.name,
    },
    {
      id: "groupType",
      header: "Tipo de grupo",
      cell: (row) => (
        <Badge variant="secondary">{formatGroupTypeLabel(row.groupType)}</Badge>
      ),
    },
    {
      id: "depositAmount",
      header: "Seña",
      className: "text-right tabular-nums",
      headerClassName: "text-right",
      cell: (row) => formatOperationalAmount(row.depositAmount),
    },
    {
      id: "owedAmount",
      header: "Saldo",
      className: "text-right tabular-nums",
      headerClassName: "text-right",
      cell: (row) => formatOperationalAmount(row.owedAmount),
      sortValue: (row) => row.owedAmount.amount,
    },
    {
      id: "financialState",
      header: "Estado",
      cell: (row) => (
        <Badge variant={getFinancialStateBadgeVariant(row.financialState)}>
          {formatChoreographyFinancialState(row.financialState)}
        </Badge>
      ),
      filterValue: (row) => row.financialState,
    },
  ];
}

function getFinancialStateBadgeVariant(
  status: ChoreographyFinanceRow["financialState"],
) {
  switch (status) {
    case "impaga":
      return "warning";
    case "señada":
      return "info";
    case "pagada":
      return "success";
  }
}

function AccountCurrentActionsMenu({
  onRegisterPayment,
}: {
  onRegisterPayment: () => void;
}) {
  return (
    <ResourceActionsMenu contentClassName="w-60">
      <DropdownMenuGroup>
        <DropdownMenuItem onSelect={onRegisterPayment}>
          Registrar pago
        </DropdownMenuItem>
      </DropdownMenuGroup>
    </ResourceActionsMenu>
  );
}

function hasPaymentActionErrors(
  actionData?: AdministrativeAcademyAccountCurrentActionData,
) {
  return (
    actionData?.status === "error" &&
    paymentFieldNames.some((fieldName) => fieldName in actionData.fieldErrors)
  );
}
