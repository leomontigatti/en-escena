import {
  AdminEmptyState,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import {
  ClientDataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import { Badge } from "@/components/ui/badge";
import { formatLongBusinessDate } from "@/lib/shared/business-time-zone";

import type { EventsListLoaderData, EventListRow } from "./shared";

export type EventsListViewProps = {
  loaderData: EventsListLoaderData;
};

export function EventsListView({ loaderData }: EventsListViewProps) {
  return (
    <AdminResourceLayout
      title="Eventos"
      description="Gestioná las fechas principales y estado de cada evento."
      action={{ label: "Nuevo evento", to: "/administracion/eventos/nuevo" }}
      requireSelectedEvent={false}
    >
      {loaderData.events.length > 0 ? (
        <EventTable events={loaderData.events} />
      ) : (
        <AdminEmptyState
          title="Todavía no hay eventos creados."
          description="Creá el primer evento para definir fechas, seña requerida y preparar la operación sin activarlo todavía."
        />
      )}
    </AdminResourceLayout>
  );
}

function EventTable({ events }: { events: EventListRow[] }) {
  const columns: DataTableColumn<EventListRow>[] = [
    {
      id: "name",
      header: "Nombre",
      className: "min-w-56 font-medium",
      cell: (event) => (
        <DataTableLink to={`/administracion/eventos/${event.id}`}>
          {event.name}
        </DataTableLink>
      ),
      filterValue: (event) => event.name,
      sortValue: (event) => event.name,
    },
    {
      // One day per column, spelled the way the schedules list spells a date.
      // Nothing about inscriptions: those are opened and closed per
      // `Cronograma`, and the schedules list is where they read.
      id: "startsAt",
      header: "Fecha de inicio",
      className: "text-muted-foreground whitespace-nowrap",
      cell: (event) => formatLongBusinessDate(event.startsAt),
      filterValue: (event) => formatLongBusinessDate(event.startsAt),
      sortValue: (event) => event.startsAt,
    },
    {
      id: "endsAt",
      header: "Fecha de finalización",
      className: "text-muted-foreground whitespace-nowrap",
      cell: (event) => formatLongBusinessDate(event.endsAt),
      filterValue: (event) => formatLongBusinessDate(event.endsAt),
      sortValue: (event) => event.endsAt,
    },
    {
      id: "status",
      header: "Estado",
      cell: (event) => {
        return (
          <div className="flex flex-wrap gap-2">
            <Badge variant={event.active ? "success" : "secondary"}>
              {event.active ? "Activo" : "Inactivo"}
            </Badge>
            <Badge variant={getTemporalStateBadgeVariant(event.temporalState)}>
              {event.temporalState.label}
            </Badge>
            {event.shouldShowRegistrationReadiness &&
            !event.isRegistrationReady ? (
              <Badge variant="warning">Configuración pendiente</Badge>
            ) : null}
          </div>
        );
      },
      filterValue: (event) =>
        `${event.active ? "Activo" : "Inactivo"} ${event.temporalState.label} ${
          event.shouldShowRegistrationReadiness && !event.isRegistrationReady
            ? "Configuración pendiente"
            : ""
        }`,
      filterValues: (event) => [
        event.active ? "active" : "inactive",
        event.temporalState.value,
        event.shouldShowRegistrationReadiness && !event.isRegistrationReady
          ? "configuration-pending"
          : "registration-ready",
      ],
    },
  ];

  return (
    <ClientDataTable
      rows={events}
      columns={columns}
      getRowKey={(event) => event.id}
      searchPlaceholder="Buscar evento por nombre"
      textFilterColumnId="name"
      emptyMessage="No hay eventos que coincidan con la búsqueda."
      initialSort={{ columnId: "startsAt", direction: "desc" }}
    />
  );
}

function getTemporalStateBadgeVariant(
  temporalState: EventListRow["temporalState"],
) {
  switch (temporalState.value) {
    case "not-started":
      return "info";
    case "in-progress":
      return "success";
    case "finished":
      return "secondary";
  }
}
