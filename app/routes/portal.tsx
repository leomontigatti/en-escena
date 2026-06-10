import {
  AccessHeader,
  AccessPage,
  AccessSecondaryLink,
  PrivateAccessHeader,
} from "@/components/access-ui";
import { db } from "@/db";
import { requireAcademyUser } from "@/lib/internal-access.server";
import type { events as eventsTable } from "@/db/schema";

import type { Route } from "./+types/portal";

const portalEventQueryParamName = "evento";

type PortalRouteProps = Pick<Route.ComponentProps, "loaderData">;
type PortalEventRecord = typeof eventsTable.$inferSelect;
type PortalEventSummary = Pick<
  PortalEventRecord,
  | "id"
  | "name"
  | "active"
  | "registrationStartsAt"
  | "registrationEndsAt"
  | "startsAt"
  | "endsAt"
>;
type PortalEventContext = {
  queryParamName: string;
  events: PortalEventSummary[];
  selectedEvent: PortalEventSummary | null;
  hasEvents: boolean;
  isReadOnly: boolean;
  isRegistrationOpen: boolean;
};

export const meta: Route.MetaFunction = () => [
  { title: "Portal de academias | En Escena" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const { user, academy } = await requireAcademyUser(request);
  const eventContext = await getPortalEventContext(request);

  return {
    email: user.email,
    academy,
    eventContext,
  };
}

async function getPortalEventContext(
  request: Request,
): Promise<PortalEventContext> {
  const selectedEventId = new URL(request.url).searchParams.get(
    portalEventQueryParamName,
  );
  const events = await db.query.events.findMany({
    columns: {
      id: true,
      name: true,
      active: true,
      registrationStartsAt: true,
      registrationEndsAt: true,
      startsAt: true,
      endsAt: true,
    },
    orderBy: (table, { desc }) => [desc(table.startsAt), desc(table.createdAt)],
  });

  const selectedEvent = selectPortalEvent(events, selectedEventId);
  const now = new Date();

  return {
    queryParamName: portalEventQueryParamName,
    events,
    selectedEvent,
    hasEvents: events.length > 0,
    isReadOnly: selectedEvent ? !selectedEvent.active : true,
    isRegistrationOpen: isRegistrationWindowOpen(selectedEvent, now),
  };
}

function selectPortalEvent(
  events: PortalEventSummary[],
  selectedEventId: string | null,
): PortalEventSummary | null {
  const querySelectedEvent = events.find(
    (event) => event.id === selectedEventId,
  );
  const defaultEvent = events.find((event) => event.active) ?? events.at(0);

  return querySelectedEvent ?? defaultEvent ?? null;
}

function isRegistrationWindowOpen(event: PortalEventSummary | null, now: Date) {
  if (!event) {
    return false;
  }

  return event.registrationStartsAt <= now && now <= event.registrationEndsAt;
}

export function PortalRouteView({ loaderData }: PortalRouteProps) {
  const { eventContext } = loaderData;
  const selectedEvent = eventContext.selectedEvent;
  const canCreateCoreographies =
    selectedEvent !== null &&
    !eventContext.isReadOnly &&
    eventContext.isRegistrationOpen;

  return (
    <AccessPage width="xl">
      <PrivateAccessHeader email={loaderData.email} />
      <AccessHeader
        eyebrow="Portal de academias"
        title={loaderData.academy.name}
        description={
          <>
            Desde acá se van a gestionar profesores, bailarines y coreografías
            de la academia.
          </>
        }
      />

      <dl className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg bg-slate-50 p-4">
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Contacto
          </dt>
          <dd className="mt-2 break-words text-sm font-medium text-slate-950">
            {loaderData.academy.contactName}
          </dd>
        </div>
        <div className="rounded-lg bg-slate-50 p-4">
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Teléfono
          </dt>
          <dd className="mt-2 break-words text-sm font-medium text-slate-950">
            {loaderData.academy.phone}
          </dd>
        </div>
      </dl>

      <AcademyAreasSection />

      <section className="mt-8" aria-labelledby="coreografias-title">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p
              id="coreografias-title"
              className="text-sm font-semibold text-slate-950"
            >
              Coreografías
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Esta sección usa el Evento consultado para revisar información
              específica de cada Evento.
            </p>
          </div>
          <PortalEventSelector eventContext={eventContext} />
        </div>

        <div className="mt-4 rounded-lg border border-slate-200 bg-white p-5">
          {selectedEvent ? (
            <>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-base font-semibold text-slate-950">
                    {selectedEvent.name}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    No hay coreografías registradas para este evento.
                  </p>
                </div>
                <span
                  className={
                    eventContext.isReadOnly
                      ? "inline-flex w-fit rounded-md bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800"
                      : "inline-flex w-fit rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800"
                  }
                >
                  {eventContext.isReadOnly
                    ? "Solo lectura"
                    : "Contexto editable"}
                </span>
              </div>
              <p className="mt-4 rounded-lg bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
                {canCreateCoreographies
                  ? "La creación de coreografías va a estar disponible para este Evento mientras la inscripción esté abierta."
                  : "La creación de coreografías va a estar disponible solo cuando el Evento consultado sea el Evento activo y la inscripción esté abierta."}
              </p>
            </>
          ) : (
            <div>
              <h2 className="text-base font-semibold text-slate-950">
                Todavía no hay Eventos configurados
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Cuando administración cree un Evento, vas a poder consultarlo
                desde esta sección. La gestión de profesores y bailarines sigue
                disponible como información de la academia.
              </p>
            </div>
          )}
        </div>
      </section>

      <AccessSecondaryLink to="/" className="mt-8">
        Volver al inicio
      </AccessSecondaryLink>
    </AccessPage>
  );
}

function AcademyAreasSection() {
  return (
    <section className="mt-8" aria-labelledby="areas-academia-title">
      <div>
        <p
          id="areas-academia-title"
          className="text-sm font-semibold text-slate-950"
        >
          Áreas de la academia
        </p>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          Profesores y bailarines se gestionan como datos de la academia,
          incluso cuando no hay Evento activo.
        </p>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <AcademyAreaCard title="Profesores">
          La carga y edición de profesores se va a sumar en una próxima
          iteración.
        </AcademyAreaCard>
        <AcademyAreaCard title="Bailarines">
          La carga y edición de bailarines se va a sumar en una próxima
          iteración.
        </AcademyAreaCard>
      </div>
    </section>
  );
}

function AcademyAreaCard({
  title,
  children,
}: {
  title: string;
  children: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <h2 className="text-sm font-semibold text-slate-950">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{children}</p>
    </div>
  );
}

function PortalEventSelector({
  eventContext,
}: {
  eventContext: PortalEventContext;
}) {
  if (!eventContext.hasEvents) {
    return null;
  }

  return (
    <form method="get" className="w-full sm:max-w-xs">
      <label
        htmlFor="evento-consultado"
        className="block text-sm font-medium text-slate-800"
      >
        Evento consultado
      </label>
      <div className="mt-2 flex gap-2">
        <select
          id="evento-consultado"
          name={eventContext.queryParamName}
          defaultValue={eventContext.selectedEvent?.id}
          className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm focus-visible:border-teal-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
        >
          {eventContext.events.map((event) => (
            <option key={event.id} value={event.id}>
              {event.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="inline-flex h-10 items-center justify-center rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
        >
          Consultar
        </button>
      </div>
    </form>
  );
}

export default PortalRouteView;
