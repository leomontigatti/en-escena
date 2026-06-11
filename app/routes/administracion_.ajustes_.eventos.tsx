import { desc } from "drizzle-orm";
import { Plus } from "lucide-react";
import { Link } from "react-router";

import { AdminShell } from "@/components/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { db } from "@/db";
import { events as eventsTable } from "@/db/schema";
import {
  loadAdminEventContext,
  type AdminEventContext,
} from "@/lib/admin-event-context.server";
import { requireAdminPanelUser } from "@/lib/internal-navigation.server";

import type { Route } from "./+types/administracion_.ajustes_.eventos";

type EventRow = typeof eventsTable.$inferSelect;

type AdministracionEventosRouteProps = {
  loaderData: {
    email: string;
    eventOptions: AdminEventContext["events"];
    events: EventRow[];
    selectedEventId: string | null;
  };
};

const dateTimeFormatter = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Argentina/Buenos_Aires",
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
  const selectedEventId = new URL(request.url).searchParams.get("evento");

  return {
    email: user.email,
    eventOptions: eventContext.events,
    events: eventRows,
    selectedEventId,
  };
}

export function AdministracionEventosRouteView({
  loaderData,
}: AdministracionEventosRouteProps) {
  return (
    <AdminShell
      email={loaderData.email}
      events={loaderData.eventOptions}
      selectedEventId={null}
      title="Eventos"
      showEventSelector={false}
    >
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">
              Eventos configurados
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Consultá fechas principales y estado de cada Evento.
            </p>
          </div>
          <Button asChild>
            <Link to="/administracion/ajustes/eventos/nuevo">
              <Plus data-icon="inline-start" />
              Crear Evento
            </Link>
          </Button>
        </div>

        {loaderData.events.length > 0 ? (
          <EventTable
            events={loaderData.events}
            selectedEventId={loaderData.selectedEventId}
          />
        ) : (
          <EmptyEventState />
        )}
      </section>
    </AdminShell>
  );
}

export default function AdministracionEventosRoute({
  loaderData,
}: AdministracionEventosRouteProps) {
  return <AdministracionEventosRouteView loaderData={loaderData} />;
}

function EventTable({
  events,
  selectedEventId,
}: {
  events: EventRow[];
  selectedEventId: string | null;
}) {
  return (
    <div className="rounded-lg border bg-background">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Inscripción</TableHead>
            <TableHead>Evento</TableHead>
            <TableHead>Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.map((event) => (
            <EventTableRow
              key={event.id}
              event={event}
              isSelected={event.id === selectedEventId}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function EventTableRow({
  event,
  isSelected,
}: {
  event: EventRow;
  isSelected: boolean;
}) {
  const temporalState = getTemporalState(event);

  return (
    <TableRow id={event.id} data-state={isSelected ? "selected" : undefined}>
      <TableCell className="min-w-56 font-medium">
        <Link
          to={`/administracion/ajustes/eventos/${event.id}`}
          className="text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {event.name}
        </Link>
        {isSelected ? (
          <span className="mt-1 block text-xs font-medium text-muted-foreground">
            Evento creado
          </span>
        ) : null}
      </TableCell>
      <TableCell>
        <DateRange
          startsAt={event.registrationStartsAt}
          endsAt={event.registrationEndsAt}
        />
      </TableCell>
      <TableCell>
        <DateRange startsAt={event.startsAt} endsAt={event.endsAt} />
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-2">
          <Badge variant={event.active ? "default" : "secondary"}>
            {event.active ? "Activo" : "Inactivo"}
          </Badge>
          <Badge variant="outline">{temporalState.label}</Badge>
        </div>
      </TableCell>
    </TableRow>
  );
}

function EmptyEventState() {
  return (
    <div className="rounded-lg border border-dashed bg-background px-5 py-8">
      <h3 className="text-base font-semibold text-slate-950">
        Todavía no hay Eventos creados.
      </h3>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
        Creá el primer Evento para definir fechas, seña requerida y preparar la
        operación sin activarlo todavía.
      </p>
      <Button asChild className="mt-4">
        <Link to="/administracion/ajustes/eventos/nuevo">
          <Plus data-icon="inline-start" />
          Crear Evento
        </Link>
      </Button>
    </div>
  );
}

function DateRange({ startsAt, endsAt }: { startsAt: Date; endsAt: Date }) {
  return (
    <span>
      {formatDateTime(startsAt)}
      <span className="block text-xs text-muted-foreground">
        hasta {formatDateTime(endsAt)}
      </span>
    </span>
  );
}

function getTemporalState(event: Pick<EventRow, "startsAt" | "endsAt">) {
  const now = new Date();

  if (now < event.startsAt) {
    return { label: "No iniciado" };
  }

  if (now > event.endsAt) {
    return { label: "Finalizado" };
  }

  return { label: "En curso" };
}

function formatDateTime(date: Date) {
  return dateTimeFormatter.format(date);
}
