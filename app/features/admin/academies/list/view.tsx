import { Building2 } from "lucide-react";

import {
  AdminEmptyState,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";

import type { loadAdministrativeAcademiesList } from "./server";

type LoaderData = Awaited<ReturnType<typeof loadAdministrativeAcademiesList>>;
type AcademyRow = LoaderData["academies"][number];

type AdministracionAcademiasRouteViewProps = {
  loaderData: LoaderData;
};

const academyColumns: DataTableColumn<AcademyRow>[] = [
  {
    id: "name",
    header: "Academia",
    className: "min-w-56 font-medium",
    cell: (academy) => (
      <DataTableLink to={`/administracion/academias/${academy.id}`}>
        {academy.name}
      </DataTableLink>
    ),
    filterValue: (academy) => academy.name,
    sortValue: (academy) => academy.name,
  },
  {
    id: "contactName",
    header: "Contacto",
    className: "text-muted-foreground",
    cell: (academy) => academy.contactName,
    filterValue: (academy) => academy.contactName,
    sortValue: (academy) => academy.contactName,
  },
  {
    id: "phone",
    header: "Teléfono",
    className: "text-muted-foreground",
    cell: (academy) => academy.phone,
    filterValue: (academy) => academy.phone,
  },
  {
    id: "account",
    header: "Finanzas",
    className: "text-muted-foreground",
    cell: () => "Cuenta corriente",
    filterValue: () => "Cuenta corriente",
  },
];

export function AdministracionAcademiasRouteView({
  loaderData,
}: AdministracionAcademiasRouteViewProps) {
  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title="Academias"
      description="Abrí la cuenta corriente de cada academia dentro del evento activo para registrar pagos y revisar su saldo disponible."
      eventRequiredEmptyState={{
        title: "Elegí un evento activo para revisar academias",
        description:
          "Activá un evento para abrir la cuenta corriente de cada academia y registrar pagos.",
      }}
    >
      {loaderData.academies.length > 0 ? (
        <DataTable
          mode="client"
          rows={loaderData.academies}
          columns={academyColumns}
          getRowKey={(academy) => academy.id}
          searchPlaceholder="Buscar academia por nombre, contacto o teléfono"
          textFilterColumnId="name"
          emptyMessage="No hay academias que coincidan con la búsqueda."
        />
      ) : (
        <AdminEmptyState
          icon={Building2}
          title="Todavía no hay academias registradas."
          description="Cuando exista al menos una academia, vas a poder abrir su cuenta corriente desde este listado."
        />
      )}
    </AdminResourceLayout>
  );
}
