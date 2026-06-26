import {
  AdminEmptyState,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import { Badge } from "@/components/ui/badge";
import { BUSINESS_TIME_ZONE } from "@/lib/shared/business-time-zone";

import type {
  AdministrativeEventsListLoaderData,
  EventListRow,
} from "./shared";

export type AdministrativeEventsListViewProps = {
  loaderData: AdministrativeEventsListLoaderData;
};

const dateFormatter = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "short",
  timeZone: BUSINESS_TIME_ZONE,
});

export function AdministrativeEventsListView({
  loaderData,
}: AdministrativeEventsListViewProps) {
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
      id: "registration",
      header: "Inscripción",
      cell: (event) => (
        <DateRange
          startsAt={event.registrationStartsAt}
          endsAt={event.registrationEndsAt}
        />
      ),
      filterValue: (event) =>
        `${formatDate(event.registrationStartsAt)} ${formatDate(
          event.registrationEndsAt,
        )}`,
    },
    {
      id: "event",
      header: "Evento",
      cell: (event) => (
        <DateRange startsAt={event.startsAt} endsAt={event.endsAt} />
      ),
      filterValue: (event) =>
        `${formatDate(event.startsAt)} ${formatDate(event.endsAt)}`,
      sortValue: (event) => event.startsAt,
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
    <DataTable
      mode="client"
      rows={events}
      columns={columns}
      getRowKey={(event) => event.id}
      searchPlaceholder="Buscar evento por nombre"
      textFilterColumnId="name"
      emptyMessage="No hay eventos que coincidan con la búsqueda."
      initialSort={{ columnId: "event", direction: "desc" }}
    />
  );
}

function DateRange({ startsAt, endsAt }: { startsAt: Date; endsAt: Date }) {
  return (
    <span>
      {formatDate(startsAt)}
      <span className="block text-xs text-muted-foreground">
        hasta {formatDate(endsAt)}
      </span>
    </span>
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

function formatDate(date: Date) {
  return dateFormatter.format(date);
}
