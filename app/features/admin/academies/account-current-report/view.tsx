import { FileSpreadsheet } from "lucide-react";
import { Link } from "react-router";

import {
  AdminEmptyState,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { Button } from "@/components/ui/button";
import { formatAmount } from "@/features/admin/academies/account-current/formatters";

import type { loadAdministrativeAcademyAccountCurrentReport } from "./server";

type LoaderData = Awaited<
  ReturnType<typeof loadAdministrativeAcademyAccountCurrentReport>
>;
type ReportRow = LoaderData["rows"][number];

type AdministracionAcademiasReporteCuentaCorrienteRouteViewProps = {
  loaderData: LoaderData;
};

const reportColumns: DataTableColumn<ReportRow>[] = [
  {
    id: "academyName",
    header: "Academia",
    className: "min-w-56 font-medium",
    cell: (row) => row.academyName,
    filterValue: (row) => row.academyName,
    sortValue: (row) => row.academyName,
  },
  {
    id: "totalPaidAmount",
    header: "Monto total pagado",
    className: "text-right tabular-nums",
    headerClassName: "text-right",
    cell: (row) => formatAmount(row.totalPaidAmount),
    sortValue: (row) => row.totalPaidAmount,
  },
  {
    id: "availableBalanceAmount",
    header: "Saldo disponible",
    className: "text-right tabular-nums",
    headerClassName: "text-right",
    cell: (row) => formatAmount(row.availableBalanceAmount),
    sortValue: (row) => row.availableBalanceAmount,
  },
  {
    id: "owedAmount",
    header: "Saldo adeudado",
    className: "text-right tabular-nums",
    headerClassName: "text-right",
    cell: (row) => formatAmount(row.owedAmount),
    sortValue: (row) => row.owedAmount,
  },
];

export function AdministracionAcademiasReporteCuentaCorrienteRouteView({
  loaderData,
}: AdministracionAcademiasReporteCuentaCorrienteRouteViewProps) {
  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title="Reporte de cuenta corriente"
      description="Consultá por academia el total pagado, el saldo disponible y el saldo adeudado del evento activo."
      eventRequiredEmptyState={{
        title: "No hay un evento activo para reportar",
        description:
          "Activá un evento para ver el reporte de cuenta corriente por academia.",
      }}
      headerAction={
        <Button asChild variant="outline">
          <Link to="/administracion/academias">
            <FileSpreadsheet aria-hidden="true" data-icon />
            Ver academias
          </Link>
        </Button>
      }
    >
      {loaderData.rows.length > 0 ? (
        <DataTable
          mode="client"
          rows={loaderData.rows}
          columns={reportColumns}
          getRowKey={(row) => row.academyId}
          searchPlaceholder="Buscar academia por nombre"
          textFilterColumnId="academyName"
          initialSort={{
            columnId: "academyName",
            direction: "asc",
          }}
          emptyMessage="No hay academias del evento activo para reportar."
        />
      ) : (
        <AdminEmptyState
          icon={FileSpreadsheet}
          title="Todavía no hay academias para reportar."
          description="Cuando el evento activo tenga academias con coreografías o movimientos financieros, el reporte va a aparecer acá."
        />
      )}
    </AdminResourceLayout>
  );
}
