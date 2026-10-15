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
import {
  formatAmount,
  formatOperationalAmount,
} from "@/lib/finances/formatters";
import { resolveInscriptionStatusBadge } from "@/lib/finances/inscription-financial-status";
import { operationalFinanceColumns } from "@/lib/finances/operational-finance-columns";
import { OperationalFinanceMetrics } from "@/lib/finances/operational-finance-metrics";
import {
  OwnerPaymentCard,
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
    cell: (row) => <SeminarStatusBadge row={row} />,
  },
];

function SeminarStatusBadge({ row }: { row: SeminarFinanceRow }) {
  return (
    <FinancialStatusBadge
      status={resolveInscriptionStatusBadge({
        anomalies: row.anomalies,
        financialStatus: row.financialStatus,
      })}
    />
  );
}

/** A seminar on a phone: the seminar and its state, then the three figures
 * the table's columns show. */
function SeminarFinanceCard({ row }: { row: SeminarFinanceRow }) {
  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 font-medium wrap-break-word">
          {row.instructorName}
        </span>
        <SeminarStatusBadge row={row} />
      </div>
      <p className="text-sm text-muted-foreground">
        {formatDate(row.scheduledDate)}
      </p>
      <dl className="grid grid-cols-3 gap-3 text-sm">
        <CardFigure
          label="Seña"
          value={formatOperationalAmount(row.depositAmount)}
        />
        <CardFigure
          label="Total"
          value={formatOperationalAmount(row.totalAmount)}
        />
        <CardFigure
          label="Saldo adeudado"
          value={formatOperationalAmount(row.owedBalanceAmount)}
        />
      </dl>
    </>
  );
}

function CardFigure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}

/** A comprobante on a phone: its number and amount, then what it is, what it
 * invoices, its state and its date. */
function ComprobanteCard({ row }: { row: ComprobanteRow }) {
  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-medium tabular-nums">
          {formatComprobanteNumber(row)}
        </span>
        <span className="text-sm font-medium tabular-nums">
          {formatAmount(row.impTotal)}
        </span>
      </div>
      <p className="text-sm wrap-break-word text-muted-foreground">
        {formatComprobanteAnchorLabel(row.anchor)}
      </p>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="flex items-center gap-2">
          <Badge
            variant={comprobanteTipoBadgeVariant(row.cbteTipo)}
            title={formatComprobanteTipoLabel(row.cbteTipo)}
          >
            {formatComprobanteTipoInitials(row.cbteTipo)}
          </Badge>
          <ComprobanteStatusBadge status={row.status} />
        </span>
        <span className="text-muted-foreground tabular-nums">
          {formatComprobanteArcaDate(row.cbteFch)}
        </span>
      </div>
    </>
  );
}

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
              renderCard={(row) => <OwnerPaymentCard row={row} />}
              searchPlaceholder="Buscar por referencia o número"
              initialSort={{ columnId: "paymentDate", direction: "desc" }}
              emptyMessage="Todavía no hay pagos registrados."
            />
          ) : tab.value === comprobantesTab ? (
            <ClientDataTable
              rows={loaderData.comprobantes}
              columns={comprobanteColumns}
              getRowKey={(row) => row.id}
              renderCard={(row) => <ComprobanteCard row={row} />}
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
              renderCard={(row) => <SeminarFinanceCard row={row} />}
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
