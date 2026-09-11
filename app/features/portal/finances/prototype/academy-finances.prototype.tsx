// PROTOTYPE — throwaway, lives only on branch `prototype/891-seminar-money-portal`.
//
// Part of the portal seminar-money prototype for wayfinder ticket #891 (map #884):
// the academy's `Resumen financiero` (`features/portal/finances/view.tsx`) with
// seminar lines beside the choreography ones.
import { useState } from "react";

import { PortalListPage } from "@/components/portal/ui";
import {
  ClientDataTable,
  type DataTableColumn,
  type DataTableFacetedFilter,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  ChoreographyUnitRow,
  FigureTotals,
  PortalSeminarMoneyPrototypeData,
  SeminarInscriptionLine,
  SeminarUnitRow,
} from "@/features/portal/seminars/prototype/seminar-money-portal-fixtures.prototype";
import { formatEventSequenceNumber } from "@/lib/events/sequence-number";
import {
  formatInscriptionFinancialStatus,
  getInscriptionFinancialStatusBadgeVariant,
  inscriptionFinancialStatusOptions,
} from "@/lib/finances/choreography-financial-status";
import { formatDate } from "@/lib/finances/formatters";
import {
  inscriptionFinanceColumns,
  inscriptionFinanceFacetedFilters,
  type InscriptionFinanceRow,
} from "@/lib/finances/inscription-finance-columns";
import type { InscriptionFinancialStatus } from "@/lib/finances/inscription-financial-status";
import { operationalFinanceColumns } from "@/lib/finances/operational-finance-columns";
import { OperationalFinanceMetrics } from "@/lib/finances/operational-finance-metrics";
import { resolveSelectedOperationalTotals } from "@/lib/finances/selected-operational-totals";
import { formatGroupTypeLabel } from "@/lib/portal/choreographies";

export type FinancesVariantId = "A" | "B" | "C";

type FinanceTab = "coreografias" | "seminarios";

const statusFacets: DataTableFacetedFilter[] = [
  {
    id: "estado",
    label: "Estado",
    options: [...inscriptionFinancialStatusOptions],
  },
];

function statusColumn<
  TRow extends { financialStatus: InscriptionFinancialStatus },
>(): DataTableColumn<TRow> {
  return {
    id: "financialStatus",
    header: "Estado",
    cell: (row) => (
      <Badge
        variant={getInscriptionFinancialStatusBadgeVariant(row.financialStatus)}
      >
        {formatInscriptionFinancialStatus(row.financialStatus)}
      </Badge>
    ),
    filterValue: (row) => row.financialStatus,
  };
}

export function PortalAcademyFinancesPrototype({
  data,
  seminarDetailHref,
  variant,
}: {
  data: PortalSeminarMoneyPrototypeData;
  seminarDetailHref: string;
  variant: FinancesVariantId;
}) {
  if (variant === "B") {
    return (
      <SingleListFinances data={data} seminarDetailHref={seminarDetailHref} />
    );
  }

  return (
    <TabbedFinances
      data={data}
      seminarDetailHref={seminarDetailHref}
      seminarTab={variant === "C" ? "inscriptions" : "units"}
    />
  );
}

/**
 * A — the admin academy finances of #890, read-only: `Coreografías` /
 * `Seminarios` tabs, the figures follow the tab, each tab keeps its selection,
 * and a seminar row opens the `(seminar, academy)` detail.
 * C — the same tabs, but the seminar tab lists inscriptions straight away, with
 * the per-inscription columns and `Retirada`, and there is no seminar detail.
 */
function TabbedFinances({
  data,
  seminarDetailHref,
  seminarTab,
}: {
  data: PortalSeminarMoneyPrototypeData;
  seminarDetailHref: string;
  seminarTab: "inscriptions" | "units";
}) {
  const [tab, setTab] = useState<FinanceTab>("coreografias");
  const [choreographySelection, setChoreographySelection] = useState<string[]>(
    [],
  );
  const [seminarSelection, setSeminarSelection] = useState<string[]>([]);
  const summary =
    tab === "coreografias"
      ? data.summaries.choreographies
      : data.summaries.seminars;
  const { owedBalanceAmount, owedDepositAmount } =
    tab === "coreografias"
      ? resolveSelectedOperationalTotals({
          rows: data.choreographyUnitRows,
          selectedRowIds: choreographySelection,
          summary,
        })
      : resolveSelectedOperationalTotals({
          rows: data.seminarUnitRows,
          selectedRowIds: seminarTab === "units" ? seminarSelection : [],
          summary,
        });

  return (
    <PortalListPage
      titleId="finanzas-title"
      title="Resumen financiero"
      description="Revisá el estado financiero de las coreografías y los seminarios de tu academia."
    >
      <OperationalFinanceMetrics
        availableBalanceAmount={data.availableBalanceAmount}
        depositAmount={summary.depositAmount}
        owedBalanceAmount={owedBalanceAmount}
        owedDepositAmount={owedDepositAmount}
        totalAmount={summary.totalAmount}
      />

      <Tabs value={tab} onValueChange={(value) => setTab(value as FinanceTab)}>
        <TabsList variant="line">
          <TabsTrigger value="coreografias">Coreografías</TabsTrigger>
          <TabsTrigger value="seminarios">Seminarios</TabsTrigger>
        </TabsList>
        <TabsContent value="coreografias" className="pt-2">
          <ClientDataTable
            rows={data.choreographyUnitRows}
            columns={choreographyColumns}
            facetedFilters={statusFacets}
            getRowKey={(row) => row.id}
            searchPlaceholder="Buscar coreografía por número o nombre"
            textFilterColumnId="name"
            selectableRows
            selectedRowIds={choreographySelection}
            onSelectedRowIdsChange={setChoreographySelection}
            initialSort={{ columnId: "choreographyNumber", direction: "asc" }}
            emptyMessage="No hay coreografías para mostrar."
          />
        </TabsContent>
        <TabsContent value="seminarios" className="pt-2">
          {seminarTab === "units" ? (
            <ClientDataTable
              rows={data.seminarUnitRows}
              columns={buildSeminarUnitColumns(seminarDetailHref)}
              facetedFilters={statusFacets}
              getRowKey={(row) => row.id}
              searchPlaceholder="Buscar seminario por instructor"
              textFilterColumnId="instructorName"
              selectableRows
              selectedRowIds={seminarSelection}
              onSelectedRowIdsChange={setSeminarSelection}
              initialSort={{ columnId: "scheduledDate", direction: "asc" }}
              emptyMessage="Tu academia no tiene inscripciones en seminarios."
            />
          ) : (
            <ClientDataTable
              rows={toInscriptionRows(data.seminarInscriptionLines)}
              columns={seminarInscriptionColumns}
              facetedFilters={inscriptionFinanceFacetedFilters}
              getRowKey={(row) => row.id}
              searchPlaceholder="Buscar por persona o seminario"
              textFilterColumnId="inscripto"
              emptyMessage="Tu academia no tiene inscripciones en seminarios."
            />
          )}
        </TabsContent>
      </Tabs>
    </PortalListPage>
  );
}

const choreographyColumns: DataTableColumn<ChoreographyUnitRow>[] = [
  {
    id: "choreographyNumber",
    header: "#",
    className: "w-16 font-medium tabular-nums",
    headerClassName: "w-16",
    cell: (row) => (
      <DataTableLink to="#prototipo">
        {formatEventSequenceNumber(row.choreographyNumber)}
      </DataTableLink>
    ),
    sortValue: (row) => row.choreographyNumber,
  },
  {
    id: "name",
    header: "Nombre",
    className: "min-w-56 font-medium",
    cell: (row) => row.name,
    filterValue: (row) =>
      `${formatEventSequenceNumber(row.choreographyNumber)} ${row.name}`,
    sortValue: (row) => row.name,
  },
  {
    id: "groupType",
    header: "Tipo de grupo",
    cell: (row) => (
      <Badge variant="secondary">{formatGroupTypeLabel(row.groupType)}</Badge>
    ),
  },
  ...operationalFinanceColumns,
  statusColumn<ChoreographyUnitRow>(),
];

function buildSeminarUnitColumns(
  seminarDetailHref: string,
): DataTableColumn<SeminarUnitRow>[] {
  return [
    {
      // The instructor opens the detail, as the number does on a choreography.
      id: "instructorName",
      header: "Seminario",
      className: "min-w-56 font-medium",
      cell: (row) => (
        <DataTableLink to={seminarDetailHref}>
          {row.instructorName}
        </DataTableLink>
      ),
      filterValue: (row) => row.instructorName,
      sortValue: (row) => row.instructorName,
    },
    {
      id: "scheduledDate",
      header: "Fecha",
      className: "text-muted-foreground tabular-nums",
      cell: (row) => formatDate(row.scheduledDate),
      sortValue: (row) => row.scheduledDate,
    },
    {
      id: "inscriptionCount",
      header: "Inscriptos",
      className: "text-right tabular-nums",
      headerClassName: "text-right",
      cell: (row) => row.inscriptionCount,
    },
    ...operationalFinanceColumns,
    statusColumn<SeminarUnitRow>(),
  ];
}

type SeminarInscriptionRow = InscriptionFinanceRow & {
  id: string;
  fullName: string;
  seminarLabel: string;
};

function toInscriptionRows(
  lines: SeminarInscriptionLine[],
): SeminarInscriptionRow[] {
  return lines.map((line) => ({
    id: line.id,
    fullName: line.person.fullName,
    seminarLabel: `${line.instructorName} · ${formatDate(line.scheduledDate)}`,
    allocatedAmount: line.allocatedAmount,
    anomalies: [],
    depositAmount: line.depositAmount,
    effectivePrice: line.price ? { name: line.price.name } : null,
    financialStatus: line.financialStatus,
    owedBalanceAmount: line.owedBalanceAmount,
    totalAmount: line.totalAmount,
    withdrawn: line.withdrawn,
  }));
}

const seminarInscriptionColumns: DataTableColumn<SeminarInscriptionRow>[] = [
  {
    id: "inscripto",
    header: "Inscripto",
    className: "font-medium",
    cell: (row) => row.fullName,
    filterValue: (row) => `${row.fullName} ${row.seminarLabel}`,
    sortValue: (row) => row.fullName,
  },
  {
    id: "seminar",
    header: "Seminario",
    className: "text-muted-foreground",
    cell: (row) => row.seminarLabel,
    sortValue: (row) => row.seminarLabel,
  },
  ...inscriptionFinanceColumns,
];

type MixedFinanceRow = FigureTotals & {
  id: string;
  kind: "choreography" | "seminar";
  choreographyNumber: number | null;
  name: string;
  typeLabel: string;
  financialStatus: InscriptionFinancialStatus;
};

/**
 * B — one list for both kinds, as today's page with more rows: the figures are
 * the academy's (both kinds summed, #886), a `Tipo` badge says which kind a row
 * is, and a seminar reads as its instructor and date.
 */
function SingleListFinances({
  data,
  seminarDetailHref,
}: {
  data: PortalSeminarMoneyPrototypeData;
  seminarDetailHref: string;
}) {
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const rows: MixedFinanceRow[] = [
    ...data.choreographyUnitRows.map((row) => ({
      ...row,
      kind: "choreography" as const,
      typeLabel: formatGroupTypeLabel(row.groupType),
    })),
    ...data.seminarUnitRows.map((row) => ({
      ...row,
      kind: "seminar" as const,
      choreographyNumber: null,
      name: `Seminario de ${row.instructorName} · ${formatDate(row.scheduledDate)}`,
      typeLabel: "Seminario",
    })),
  ];
  const { owedBalanceAmount, owedDepositAmount } =
    resolveSelectedOperationalTotals({
      rows,
      selectedRowIds,
      summary: data.summaries.all,
    });
  const columns: DataTableColumn<MixedFinanceRow>[] = [
    {
      id: "choreographyNumber",
      header: "#",
      className: "w-16 font-medium tabular-nums",
      headerClassName: "w-16",
      cell: (row) =>
        row.choreographyNumber === null ? null : (
          <DataTableLink to="#prototipo">
            {formatEventSequenceNumber(row.choreographyNumber)}
          </DataTableLink>
        ),
    },
    {
      // A seminar has no number, so its name is the link.
      id: "name",
      header: "Nombre",
      className: "min-w-56 font-medium",
      cell: (row) =>
        row.kind === "seminar" ? (
          <DataTableLink to={seminarDetailHref}>{row.name}</DataTableLink>
        ) : (
          row.name
        ),
      filterValue: (row) =>
        row.choreographyNumber === null
          ? row.name
          : `${formatEventSequenceNumber(row.choreographyNumber)} ${row.name}`,
      sortValue: (row) => row.name,
    },
    {
      id: "type",
      header: "Tipo",
      cell: (row) => <Badge variant="secondary">{row.typeLabel}</Badge>,
      filterValue: (row) => row.kind,
    },
    ...operationalFinanceColumns,
    statusColumn<MixedFinanceRow>(),
  ];

  return (
    <PortalListPage
      titleId="finanzas-title"
      title="Resumen financiero"
      description="Revisá el estado financiero de las coreografías y los seminarios de tu academia."
    >
      <OperationalFinanceMetrics
        availableBalanceAmount={data.availableBalanceAmount}
        depositAmount={data.summaries.all.depositAmount}
        owedBalanceAmount={owedBalanceAmount}
        owedDepositAmount={owedDepositAmount}
        totalAmount={data.summaries.all.totalAmount}
      />

      <ClientDataTable
        rows={rows}
        columns={columns}
        facetedFilters={[
          {
            id: "tipo",
            label: "Tipo",
            options: [
              { label: "Coreografía", value: "choreography" },
              { label: "Seminario", value: "seminar" },
            ],
          },
          ...statusFacets,
        ]}
        getRowKey={(row) => row.id}
        searchPlaceholder="Buscar por número, nombre o instructor"
        textFilterColumnId="name"
        selectableRows
        selectedRowIds={selectedRowIds}
        onSelectedRowIdsChange={setSelectedRowIds}
        emptyMessage="No hay coreografías ni seminarios para mostrar."
      />
    </PortalListPage>
  );
}
