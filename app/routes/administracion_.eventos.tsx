import { desc } from "drizzle-orm";
import { Link } from "react-router";

import {
  AdminEmptyState,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { Badge } from "@/components/ui/badge";
import { db } from "@/db";
import { events as eventsTable } from "@/db/schema";
import {
  loadAdminEventContext,
  type AdminEventContext,
} from "@/lib/admin/event-context.server";
import { BUSINESS_TIME_ZONE } from "@/lib/shared/business-time-zone";
import { requireAdminPanelUser } from "@/lib/auth/internal-navigation.server";

import type { Route } from "./+types/administracion_.eventos";

type EventRow = typeof eventsTable.$inferSelect;
type TemporalState = ReturnType<typeof getTemporalState>;
type EventListRow = EventRow & {
  temporalState: TemporalState;
};

type AdministracionEventosRouteProps = {
  loaderData: {
    email: string;
    eventOptions: AdminEventContext["events"];
    events: EventListRow[];
    selectedEventId: AdminEventContext["selectedEventId"];
  };
};

const dateFormatter = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "short",
  timeZone: BUSINESS_TIME_ZONE,
});

export const meta: Route.MetaFunction = () => [
  { title: "Eventos | Panel de administración | En Escena" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireAdminPanelUser(request);
  const eventContext = await loadAdminEventContext(request);
  const eventRows = await db.query.events.findMany({
    orderBy: [desc(eventsTable.startsAt)],
  });
  const now = new Date();

  return {
    email: user.email,
    eventOptions: eventContext.events,
    events: eventRows.map((event) => ({
      ...event,
      temporalState: getTemporalState(event, now),
    })),
    selectedEventId: eventContext.selectedEventId,
  };
}

export function AdministracionEventosRouteView({
  loaderData,
}: AdministracionEventosRouteProps) {
  return (
    <AdminResourceLayout
      loaderData={{
        email: loaderData.email,
        events: loaderData.eventOptions,
        selectedEventId: loaderData.selectedEventId,
      }}
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

export default function AdministracionEventosRoute({
  loaderData,
}: AdministracionEventosRouteProps) {
  return <AdministracionEventosRouteView loaderData={loaderData} />;
}

function EventTable({ events }: { events: EventListRow[] }) {
  const columns: DataTableColumn<EventListRow>[] = [
    {
      id: "name",
      header: "Nombre",
      className: "min-w-56 font-medium",
      cell: (event) => (
        <>
          <Link
            to={`/administracion/eventos/${event.id}`}
            className="text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {event.name}
          </Link>
        </>
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
            <Badge variant={event.active ? "default" : "secondary"}>
              {event.active ? "Activo" : "Inactivo"}
            </Badge>
            <Badge variant="outline">{event.temporalState.label}</Badge>
          </div>
        );
      },
      filterValue: (event) =>
        `${event.active ? "Activo" : "Inactivo"} ${event.temporalState.label}`,
      filterValues: (event) => [
        event.active ? "active" : "inactive",
        event.temporalState.value,
      ],
    },
  ];

  return (
    <DataTable
      rows={events}
      columns={columns}
      getRowKey={(event) => event.id}
      searchPlaceholder="Buscar evento por nombre"
      textFilterColumnId="name"
      facetedFilters={[
        {
          columnId: "status",
          label: "Filtros",
          groups: [
            {
              label: "Estado",
              options: [
                { label: "Activo", value: "active" },
                { label: "Inactivo", value: "inactive" },
              ],
            },
            {
              label: "Período",
              options: [
                { label: "No iniciado", value: "not-started" },
                { label: "En curso", value: "in-progress" },
                { label: "Finalizado", value: "finished" },
              ],
            },
          ],
        },
      ]}
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

function getTemporalState(
  event: Pick<EventRow, "startsAt" | "endsAt">,
  now: Date,
) {
  if (now < event.startsAt) {
    return { label: "No iniciado", value: "not-started" };
  }

  if (now > event.endsAt) {
    return { label: "Finalizado", value: "finished" };
  }

  return { label: "En curso", value: "in-progress" };
}

function formatDate(date: Date) {
  return dateFormatter.format(date);
}
