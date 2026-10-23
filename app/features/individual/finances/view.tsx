import { WalletCards } from "lucide-react";

import { PortalEmptyState, PortalListPage } from "@/components/portal/ui";
import {
  ClientDataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { FinancialStatusBadge } from "@/components/shared/financial-status-badge";
import { formatDate } from "@/features/admin/schedules/view-shared";
import { formatOperationalAmount } from "@/lib/finances/formatters";
import { resolveInscriptionStatusBadge } from "@/lib/finances/inscription-financial-status";
import { operationalFinanceColumns } from "@/lib/finances/operational-finance-columns";
import { OperationalFinanceMetrics } from "@/lib/finances/operational-finance-metrics";

import type { loadIndividualFinances } from "./server";

type IndividualFinancesLoaderData = Awaited<
  ReturnType<typeof loadIndividualFinances>
>;

type SeminarFinanceRow =
  IndividualFinancesLoaderData["seminarFinanceRows"][number];

const title = "Finanzas de seminarios";

const description =
  "Revisá lo que debés y lo que pagaste de cada seminario, y tu saldo disponible.";

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
        withdrawn: row.withdrawn,
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

/**
 * `Finanzas` of the individual's seminars (ADR-0019): the portal's finance
 * summary over its own money. The five metrics are the whole account and the
 * table what each seminar owes; its payments are on its `Pagos`. Everything is
 * read-only: administration records and allocates.
 */
export function IndividualFinancesView({
  loaderData,
}: {
  loaderData: IndividualFinancesLoaderData;
}) {
  if (!loaderData.activeEvent) {
    return (
      <PortalListPage
        titleId="individual-finances-title"
        title={title}
        description={description}
      >
        <PortalEmptyState
          title="No hay un evento activo"
          description="Cuando administración active un evento, vas a poder consultar acá lo que debés de tus seminarios y tu saldo."
          icon={<WalletCards aria-hidden="true" />}
        />
      </PortalListPage>
    );
  }

  const { summary } = loaderData;

  return (
    <PortalListPage
      titleId="individual-finances-title"
      title={title}
      description={description}
    >
      <OperationalFinanceMetrics
        availableBalanceAmount={summary.availableBalanceAmount}
        depositAmount={summary.depositAmount}
        owedBalanceAmount={summary.owedBalanceAmount}
        owedDepositAmount={summary.owedDepositAmount}
        totalAmount={summary.totalAmount}
      />
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
    </PortalListPage>
  );
}
