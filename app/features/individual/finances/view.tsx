import { WalletCards } from "lucide-react";
import { Fragment } from "react";

import { PortalEmptyState, PortalListPage } from "@/components/portal/ui";
import { ComprobanteStatusBadge } from "@/components/shared/comprobante-status-badge";
import {
  ClientDataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { FinancialStatusBadge } from "@/components/shared/financial-status-badge";
import { ListTabs } from "@/components/shared/list-tabs";
import { Badge } from "@/components/ui/badge";
import { formatComprobanteAnchorLabel } from "@/lib/comprobantes/anchor-reading";
import {
  comprobanteTipoBadgeVariant,
  formatComprobanteArcaDate,
  formatComprobanteNumber,
  formatComprobanteTipoInitials,
  formatComprobanteTipoLabel,
} from "@/lib/comprobantes/format";
import { formatDate } from "@/features/admin/schedules/view-shared";
import { formatAmount } from "@/lib/finances/formatters";
import { resolveInscriptionStatusBadge } from "@/lib/finances/inscription-financial-status";
import { operationalFinanceColumns } from "@/lib/finances/operational-finance-columns";
import { OperationalFinanceMetrics } from "@/lib/finances/operational-finance-metrics";
import {
  ownerPaymentColumns,
  ownerPaymentFacetedFilterIds,
  ownerPaymentFacetedFilters,
} from "@/lib/finances/owner-payment-columns";
import { listTabParam, useUrlTab } from "@/lib/shared/url-tab";
import { listQueryParamNames } from "@/lib/list-query/list-query";

import type { loadIndividualFinances } from "./server";

type IndividualFinancesLoaderData = Awaited<
  ReturnType<typeof loadIndividualFinances>
>;

type SeminarFinanceRow =
  IndividualFinancesLoaderData["seminarFinanceRows"][number];

type ComprobanteRow = IndividualFinancesLoaderData["comprobantes"][number];

const description =
  "Revisá el estado de tus seminarios, los pagos que registró administración, tu saldo disponible y tus comprobantes.";

const seminarsTab = "seminarios";
const paymentsTab = "pagos";
const comprobantesTab = "comprobantes";
const financeTabs = [seminarsTab, paymentsTab, comprobantesTab] as const;

/**
 * One row per seminar the individual is registered into: it holds one
 * inscription per seminar, so the `(seminar, owner)` unit the portal lists is
 * the inscription itself.
 */
const seminarColumns: DataTableColumn<SeminarFinanceRow>[] = [
  {
    id: "instructorName",
    header: "Seminario",
    className: "min-w-56 font-medium",
    cell: (row) => row.instructorName,
    filterValue: (row) => row.instructorName,
    sortValue: (row) => row.instructorName,
  },
  {
    id: "scheduledDate",
    header: "Fecha",
    cell: (row) => formatDate(row.scheduledDate),
    sortValue: (row) => row.scheduledDate,
  },
  ...operationalFinanceColumns,
  {
    id: "financialStatus",
    header: "Estado",
    cell: (row) => (
      <FinancialStatusBadge
        status={resolveInscriptionStatusBadge({
          anomalies: row.anomalies,
          financialStatus: row.financialStatus,
        })}
      />
    ),
  },
];

const comprobanteColumns: DataTableColumn<ComprobanteRow>[] = [
  {
    id: "numero",
    header: "Comprobante",
    className: "font-medium tabular-nums",
    cell: (row) => formatComprobanteNumber(row),
    filterValue: (row) => formatComprobanteNumber(row),
  },
  {
    id: "kind",
    header: "Tipo",
    cell: (row) => (
      <Badge
        variant={comprobanteTipoBadgeVariant(row.cbteTipo)}
        title={formatComprobanteTipoLabel(row.cbteTipo)}
      >
        {formatComprobanteTipoInitials(row.cbteTipo)}
      </Badge>
    ),
  },
  {
    id: "anchor",
    header: "Seminario",
    className: "text-muted-foreground",
    cell: (row) => formatComprobanteAnchorLabel(row.anchor),
  },
  {
    id: "status",
    header: "Estado",
    cell: (row) => <ComprobanteStatusBadge status={row.status} />,
  },
  {
    id: "fecha",
    header: "Fecha",
    className: "tabular-nums",
    cell: (row) => formatComprobanteArcaDate(row.cbteFch),
    sortValue: (row) => row.cbteFch,
  },
  {
    id: "amount",
    header: "Importe",
    className: "text-right tabular-nums",
    headerClassName: "text-right",
    cell: (row) => formatAmount(row.impTotal),
  },
];

/**
 * `Finanzas` (ADR-0019): the portal's finance summary over the individual's
 * own money. The five metrics are the whole account, the tabs split what is
 * owed, what was paid and what was invoiced. Everything is read-only:
 * administration records and allocates.
 */
export function IndividualFinancesView({
  loaderData,
}: {
  loaderData: IndividualFinancesLoaderData;
}) {
  const tab = useUrlTab({
    defaultValue: seminarsTab,
    param: listTabParam,
    // Each tab has its own search and its own filters.
    resets: [listQueryParamNames.search, ...ownerPaymentFacetedFilterIds],
    values: financeTabs,
  });

  if (!loaderData.activeEvent) {
    return (
      <PortalListPage
        titleId="individual-finances-title"
        title="Finanzas"
        description={description}
      >
        <PortalEmptyState
          title="No hay un evento activo"
          description="Cuando administración active un evento, vas a poder consultar acá tu saldo, tus pagos y tus comprobantes."
          icon={<WalletCards aria-hidden="true" />}
        />
      </PortalListPage>
    );
  }

  const { summary } = loaderData;

  return (
    <PortalListPage
      titleId="individual-finances-title"
      title="Finanzas"
      description={description}
    >
      <OperationalFinanceMetrics
        availableBalanceAmount={summary.availableBalanceAmount}
        depositAmount={summary.depositAmount}
        owedBalanceAmount={summary.owedBalanceAmount}
        owedDepositAmount={summary.owedDepositAmount}
        totalAmount={summary.totalAmount}
      />

      <ListTabs
        onValueChange={tab.onValueChange}
        tabs={[
          { label: "Seminarios", value: seminarsTab },
          { label: "Pagos", value: paymentsTab },
          { label: "Comprobantes", value: comprobantesTab },
        ]}
        value={tab.value}
      >
        {/* A key per tab, so a tab's list never inherits another's state. */}
        <Fragment key={tab.value}>
          {tab.value === paymentsTab ? (
            <ClientDataTable
              rows={loaderData.payments}
              columns={ownerPaymentColumns}
              facetedFilters={ownerPaymentFacetedFilters}
              getRowKey={(row) => row.id}
              searchPlaceholder="Buscar por referencia o número"
              initialSort={{ columnId: "paymentDate", direction: "desc" }}
              emptyMessage="Todavía no hay pagos registrados."
            />
          ) : tab.value === comprobantesTab ? (
            <ClientDataTable
              rows={loaderData.comprobantes}
              columns={comprobanteColumns}
              getRowKey={(row) => row.id}
              searchPlaceholder="Buscar por número"
              textFilterColumnId="numero"
              initialSort={{ columnId: "fecha", direction: "desc" }}
              emptyMessage="Todavía no hay comprobantes emitidos."
            />
          ) : (
            <ClientDataTable
              rows={loaderData.seminarFinanceRows}
              columns={seminarColumns}
              getRowKey={(row) => row.id}
              searchPlaceholder="Buscar por instructor"
              textFilterColumnId="instructorName"
              initialSort={{ columnId: "scheduledDate", direction: "asc" }}
              emptyMessage="Todavía no te inscribiste a ningún seminario."
            />
          )}
        </Fragment>
      </ListTabs>
    </PortalListPage>
  );
}
