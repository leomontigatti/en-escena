import { Landmark } from "lucide-react";

import {
  AdminEmptyState,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import {
  ClientDataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import {
  formatAmount,
  formatOperationalAmount,
} from "@/lib/finances/formatters";

import type { FinanceAccountRow, loadFinancesList } from "./server";

type FinancesListLoaderData = Awaited<ReturnType<typeof loadFinancesList>>;

type FinancesListRouteViewProps = {
  loaderData: FinancesListLoaderData;
};

const accountColumns: DataTableColumn<FinanceAccountRow>[] = [
  {
    id: "academyName",
    header: "Nombre",
    className: "min-w-56 font-medium",
    cell: (row) => (
      <DataTableLink to={`/administracion/finanzas/${row.academyId}`}>
        {row.academyName}
      </DataTableLink>
    ),
    filterValue: (row) => row.academyName,
    sortValue: (row) => row.academyName,
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
    // Decorative and unconditional, just like in the choreographies table:
    // `Total` is the context column —what the owed figures are measured
    // against— so it is dimmed whole. Never per row: a grey that varies starts
    // meaning something again.
    className: "text-right tabular-nums text-muted-foreground",
    headerClassName: "text-right",
    cell: (row) => formatOperationalAmount(row.totalAmount),
  },
  {
    id: "owedBalanceAmount",
    header: "Saldo adeudado",
    className: "text-right tabular-nums",
    headerClassName: "text-right",
    cell: (row) => formatOperationalAmount(row.owedBalanceAmount),
  },
  {
    id: "availableBalanceAmount",
    header: "Saldo disponible",
    className: "text-right tabular-nums",
    headerClassName: "text-right",
    cell: (row) => formatAmount(row.availableBalanceAmount),
  },
];

export function FinancesListRouteView({
  loaderData,
}: FinancesListRouteViewProps) {
  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title="Finanzas"
      description="Saldo de cada academia en el evento activo: seña, total, saldo adeudado y saldo disponible."
      eventRequiredEmptyState={{
        title: "No hay un evento activo para operar finanzas",
        description:
          "Activá un evento para revisar cuentas corrientes y pagos.",
      }}
    >
      {loaderData.rows.length > 0 ? (
        <ClientDataTable
          rows={loaderData.rows}
          columns={accountColumns}
          getRowKey={(row) => row.academyId}
          searchPlaceholder="Buscar academia por nombre"
          textFilterColumnId="academyName"
          initialSort={{
            columnId: "academyName",
            direction: "asc",
          }}
          emptyMessage="No hay cuentas corrientes para mostrar."
        />
      ) : (
        <AdminEmptyState
          icon={Landmark}
          title="Todavía no hay academias con movimientos financieros."
          description="Cuando el evento activo tenga academias con coreografías o movimientos financieros, van a aparecer acá."
        />
      )}
    </AdminResourceLayout>
  );
}
