import { Music2 } from "lucide-react";

import {
  AdminEmptyState,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import {
  ClientDataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import { academyChoreographiesPath } from "@/lib/choreographies/admin-paths";
import { describeEmptyList } from "@/lib/list-query/list-query";

import type {
  ChoreographyAcademyRow,
  loadChoreographyAcademies,
} from "./server";

const emptyAcademyList = describeEmptyList("academias", "search");

type ChoreographyAcademiesLoaderData = Awaited<
  ReturnType<typeof loadChoreographyAcademies>
>;

type ChoreographyAcademiesRouteViewProps = {
  loaderData: ChoreographyAcademiesLoaderData;
};

const countColumnClassName = "text-right tabular-nums";

const academyColumns: DataTableColumn<ChoreographyAcademyRow>[] = [
  {
    id: "academyName",
    header: "Academia",
    className: "min-w-56 font-medium",
    cell: (row) => (
      <DataTableLink to={academyChoreographiesPath(row.academyId)}>
        {row.academyName}
      </DataTableLink>
    ),
    filterValue: (row) => row.academyName,
    sortValue: (row) => row.academyName,
  },
  {
    id: "choreographyCount",
    header: "Coreografías",
    className: countColumnClassName,
    headerClassName: "text-right",
    cell: (row) => row.choreographyCount,
  },
  {
    id: "incompleteCount",
    header: "Incompletas",
    className: countColumnClassName,
    headerClassName: "text-right",
    cell: (row) => row.incompleteCount,
  },
  {
    id: "withdrawnCount",
    header: "Retiradas",
    className: countColumnClassName,
    headerClassName: "text-right",
    cell: (row) => row.withdrawnCount,
  },
];

export function ChoreographyAcademiesRouteView({
  loaderData,
}: ChoreographyAcademiesRouteViewProps) {
  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title="Coreografías"
      description="Academias con coreografías en el evento activo. Entrá a una para revisar sus coreografías y su estado operativo."
      eventRequiredEmptyState={{
        title: "Elegí un evento activo para revisar coreografías",
        description:
          "Activá un evento para consultar las coreografías registradas por las academias.",
      }}
    >
      {loaderData.rows.length > 0 ? (
        <ClientDataTable
          rows={loaderData.rows}
          columns={academyColumns}
          getRowKey={(row) => row.academyId}
          searchPlaceholder="Buscar academia por nombre"
          textFilterColumnId="academyName"
          initialSort={{ columnId: "academyName", direction: "asc" }}
          emptyMessage={emptyAcademyList.nothingMatched}
        />
      ) : (
        <AdminEmptyState
          icon={Music2}
          title="Todavía no hay academias con coreografías en este evento."
          description="Cuando las academias registren coreografías para el evento activo, van a aparecer acá."
        />
      )}
    </AdminResourceLayout>
  );
}
