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
} from "@/features/admin/academies/account-current/formatters";
import { cn } from "@/lib/shared/utils";

import type {
  FinanceAccountRow,
  loadAdminFinanceAccountCurrentList,
} from "./server";

type AccountCurrentLoaderData = Awaited<
  ReturnType<typeof loadAdminFinanceAccountCurrentList>
>;

type AdministracionFinanzasRouteViewProps = {
  loaderData: AccountCurrentLoaderData;
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
    id: "owedDepositAmount",
    header: "Seña adeudada",
    className: "text-right tabular-nums",
    headerClassName: "text-right",
    cell: (row) => formatOperationalAmount(row.owedDepositAmount),
  },
  {
    id: "availableBalanceAmount",
    header: "Saldo disponible",
    className: "text-right tabular-nums",
    headerClassName: "text-right",
    // Una academia sin saldo a favor es el caso normal: atenuarlo deja que las
    // que sí tienen plata disponible salten a la vista.
    cell: (row) => (
      <span
        className={cn(
          row.availableBalanceAmount === 0 && "text-muted-foreground",
        )}
      >
        {formatAmount(row.availableBalanceAmount)}
      </span>
    ),
  },
  {
    id: "owedBalanceAmount",
    header: "Saldo adeudado",
    className: "text-right tabular-nums",
    headerClassName: "text-right",
    cell: (row) => formatOperationalAmount(row.owedBalanceAmount),
  },
];

export function AdministracionFinanzasRouteView({
  loaderData,
}: AdministracionFinanzasRouteViewProps) {
  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title="Resumen"
      description="Cuenta corriente por academia con seña adeudada, saldo disponible y saldo adeudado."
      eventRequiredEmptyState={{
        title: "No hay un evento activo para operar finanzas",
        description:
          "Activá un evento para revisar cuentas corrientes, pagos y facturas.",
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
          title="Todavía no hay resumen financiero."
          description="Cuando el evento activo tenga academias con coreografías o movimientos financieros, van a aparecer acá."
        />
      )}
    </AdminResourceLayout>
  );
}
