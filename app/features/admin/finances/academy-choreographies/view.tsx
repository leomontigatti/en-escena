import { AdminResourceLayout } from "@/components/admin/resource-layout";
import {
  ClientDataTable,
  type DataTableColumn,
  type DataTableFacetedFilter,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import { MetricCard } from "@/components/shared/metric-card";
import { Badge } from "@/components/ui/badge";
import {
  choreographyStatusFilterOptions,
  formatInscriptionStatusBadge,
} from "@/lib/finances/choreography-financial-status";
import { resolveInscriptionStatusBadge } from "@/lib/finances/inscription-financial-status";
import { formatGroupTypeLabel } from "@/lib/portal/choreographies";

import { formatAmount, formatOperationalAmount } from "../formatters";
import type { AcademyFinancesLoaderData } from "./types";

type ChoreographyFinanceRow =
  AcademyFinancesLoaderData["choreographyFinanceRows"][number];

const choreographyFinanceFacetedFilters: DataTableFacetedFilter[] = [
  {
    id: "estado",
    label: "Estado",
    options: [...choreographyStatusFilterOptions],
  },
];

type AcademyFinancesRouteViewProps = {
  loaderData: AcademyFinancesLoaderData;
};

export function AcademyFinancesRouteView({
  loaderData,
}: AcademyFinancesRouteViewProps) {
  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title={loaderData.academy.name}
      description="Lista financiera de las coreografías de esta academia."
      eventRequiredEmptyState={{
        title: "Elegí un evento activo para revisar las finanzas",
        description:
          "Activá un evento para consultar la lista financiera de las coreografías de la academia.",
      }}
    >
      <div className="flex flex-col gap-6">
        <section className="grid gap-4 md:grid-cols-3">
          <MetricCard
            title="Seña adeudada"
            value={formatOperationalAmount(
              loaderData.summary.owedDepositAmount,
            )}
          />
          <MetricCard
            title="Saldo disponible"
            value={formatAmount(loaderData.summary.availableBalanceAmount)}
          />
          <MetricCard
            title="Saldo adeudado"
            value={formatOperationalAmount(
              loaderData.summary.owedBalanceAmount,
            )}
          />
        </section>

        <ClientDataTable
          rows={loaderData.choreographyFinanceRows}
          columns={buildChoreographyFinanceColumns(loaderData.academy.id)}
          facetedFilters={choreographyFinanceFacetedFilters}
          getRowKey={(row) => row.id}
          searchPlaceholder="Buscar coreografía por nombre"
          textFilterColumnId="name"
          initialSort={{
            columnId: "name",
            direction: "asc",
          }}
          emptyMessage="No hay coreografías para mostrar."
        />
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
      id: "totalAmount",
      header: "Total",
      // Decorativo y sin condición: `Total` es la columna de contexto —contra qué
      // se mide lo adeudado—, así que va atenuada entera. Nunca por fila: un gris
      // que varía vuelve a significar algo.
      className: "text-right tabular-nums text-muted-foreground",
      headerClassName: "text-right",
      cell: (row) => formatOperationalAmount(row.totalAmount),
    },
    {
      id: "owedBalanceAmount",
      header: "Saldo adeudado",
      // La única cifra accionable de la fila, destacada por columna.
      className: "text-right font-medium tabular-nums",
      headerClassName: "text-right",
      cell: (row) => formatOperationalAmount(row.owedBalanceAmount),
    },
    {
      id: "financialStatus",
      header: "Estado",
      cell: (row) => <ChoreographyStatusCell row={row} />,
      // El filtro sale del mismo badge que la celda muestra, no de
      // `financialStatus`: una fila badgeada `Sobreasignada` que apareciera al
      // filtrar por `Señada` se contradiría en pantalla.
      filterValue: (row) => formatChoreographyStatusBadge(row).value,
    },
  ];
}

/**
 * Una anomalía **reemplaza** al badge de estado, no lo acompaña: los dos compiten
 * por la misma mirada, y `Señada` al lado de `Sobreasignada` se lee como dos
 * hechos del mismo peso cuando sólo uno pide que alguien haga algo.
 *
 * La precedencia entre ejes vive en `resolveInscriptionStatusBadge` y es
 * explícita, no posicional: un eje derivado nuevo se apila declarándose ahí, sin
 * depender del orden en que alguien empujó su anomalía al arreglo.
 */
function formatChoreographyStatusBadge(row: ChoreographyFinanceRow) {
  return formatInscriptionStatusBadge(
    resolveInscriptionStatusBadge({
      anomalies: row.anomalies,
      financialStatus: row.financialStatus,
    }),
  );
}

function ChoreographyStatusCell({ row }: { row: ChoreographyFinanceRow }) {
  const badge = formatChoreographyStatusBadge(row);

  return <Badge variant={badge.variant}>{badge.label}</Badge>;
}
