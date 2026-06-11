import { Link } from "react-router";
import { clsx } from "clsx";

import { AccessSecondaryLink } from "@/components/access-ui";
import { PortalEmptyList, PortalShell } from "@/components/portal-ui";
import { requireAcademyUser } from "@/lib/internal-access.server";
import {
  formatOperationalStatusLabel,
  type ChoreographyListItem,
} from "@/lib/portal-choreographies";
import { getPortalEventContext } from "@/lib/portal-event-context.server";

type PortalCoreografiasRouteProps = {
  loaderData: Awaited<ReturnType<typeof loader>>;
};

type PortalCoreografiasLoaderData = PortalCoreografiasRouteProps["loaderData"];
type PortalEventContext = PortalCoreografiasLoaderData["eventContext"];

export const meta = () => [
  { title: "Coreografías | Portal de academias | En Escena" },
];

export async function loader({ request }: { request: Request }) {
  const { user, academy } = await requireAcademyUser(request);
  const eventContext = await getPortalEventContext(request);
  const selectedEventId = eventContext.selectedEvent?.id ?? null;
  const { listChoreographiesForAcademyEvent } =
    await import("@/lib/portal-choreographies.server");
  const choreographies = selectedEventId
    ? await listChoreographiesForAcademyEvent(academy.id, selectedEventId)
    : [];

  return {
    email: user.email,
    academy,
    choreographies,
    eventContext,
  };
}

export function PortalCoreografiasRouteView({
  loaderData,
}: PortalCoreografiasRouteProps) {
  const selectedEvent = loaderData.eventContext.selectedEvent;
  const status = getEventStatus(loaderData.eventContext.isReadOnly);
  const creationState = getCreationState(loaderData.eventContext);
  const selectedEventQuery = selectedEvent
    ? `?${loaderData.eventContext.queryParamName}=${selectedEvent.id}`
    : "";

  return (
    <PortalShell
      email={loaderData.email}
      academyName={loaderData.academy.name}
      description={
        <>
          Consultá las coreografías de la academia según el Evento consultado.
        </>
      }
    >
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
              La lista se limita al Evento consultado y a tu academia.
            </p>
          </div>
          <PortalEventSelector eventContext={loaderData.eventContext} />
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
                    Revisá nombre, modalidad, categoría y estado operativo de
                    cada Coreografía.
                  </p>
                </div>
                <span className={status.className}>{status.label}</span>
              </div>
              <div
                className={clsx(
                  "mt-4 rounded-lg px-4 py-3 text-sm leading-6",
                  creationToneClassNames[creationState.tone],
                )}
              >
                <p>{creationState.message}</p>
              </div>

              {loaderData.choreographies.length > 0 ? (
                <ChoreographyTable
                  choreographies={loaderData.choreographies}
                  selectedEventQuery={selectedEventQuery}
                />
              ) : (
                <PortalEmptyList
                  title="No hay coreografías registradas para este evento"
                  description="Cuando se habilite el flujo de alta, las nuevas Coreografías van a aparecer acá para seguir su estado operativo."
                />
              )}
            </>
          ) : (
            <PortalEmptyList
              title="Todavía no hay Eventos configurados"
              description="Cuando administración cree un Evento, vas a poder consultar las Coreografías de tu academia desde esta sección."
            />
          )}
        </div>
      </section>

      <AccessSecondaryLink to="/portal" className="mt-8">
        Volver al inicio
      </AccessSecondaryLink>
    </PortalShell>
  );
}

export default PortalCoreografiasRouteView;

function ChoreographyTable({
  choreographies,
  selectedEventQuery,
}: {
  choreographies: PortalCoreografiasRouteProps["loaderData"]["choreographies"];
  selectedEventQuery: string;
}) {
  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
              Coreografía
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
              Modalidad
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
              Categoría
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
              Estado operativo
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {choreographies.map((choreography) => (
            <tr key={choreography.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 font-medium text-slate-950">
                <Link
                  to={`/portal/coreografias/${choreography.id}${selectedEventQuery}`}
                  className="rounded-sm underline-offset-4 hover:text-teal-800 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
                >
                  {choreography.name}
                </Link>
              </td>
              <td className="px-4 py-3 text-slate-700">
                {choreography.modalityName}
                {choreography.submodalityName
                  ? ` · ${choreography.submodalityName}`
                  : ""}
              </td>
              <td className="px-4 py-3 text-slate-700">
                {choreography.categoryName ?? "Categoría pendiente"}
                {choreography.experienceLevelName
                  ? ` · ${choreography.experienceLevelName}`
                  : ""}
              </td>
              <td className="px-4 py-3">
                <OperationalStatusBadge choreography={choreography} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OperationalStatusBadge({
  choreography,
}: {
  choreography: ChoreographyListItem;
}) {
  if (choreography.operationalStatus.code === "complete") {
    return (
      <span className="inline-flex rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
        Completa
      </span>
    );
  }

  return (
    <span className="inline-flex rounded-md bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
      {formatOperationalStatusLabel(choreography.operationalStatus)}
    </span>
  );
}

type CreationState = {
  tone: "ready" | "blocked" | "info";
  message: string;
};

const creationToneClassNames: Record<CreationState["tone"], string> = {
  ready: "bg-emerald-50 text-emerald-900",
  blocked: "bg-amber-50 text-amber-900",
  info: "bg-slate-50 text-slate-700",
};

function getCreationState(eventContext: PortalEventContext): CreationState {
  if (!eventContext.hasActiveEvent) {
    return {
      tone: "blocked",
      message: "Todavía no hay un Evento activo para registrar coreografías.",
    };
  }

  if (eventContext.activeEventRegistrationReadiness?.isReady === false) {
    return {
      tone: "blocked",
      message:
        "El Evento activo todavía no tiene la configuración mínima para registrar coreografías.",
    };
  }

  if (
    eventContext.selectedEvent !== null &&
    !eventContext.isReadOnly &&
    eventContext.isRegistrationOpen &&
    eventContext.activeEventRegistrationReadiness?.isReady === true
  ) {
    return {
      tone: "ready",
      message:
        "La creación de coreografías va a estar disponible para este Evento mientras la inscripción esté abierta.",
    };
  }

  return {
    tone: "info",
    message:
      "La creación de coreografías va a estar disponible solo cuando el Evento consultado sea el Evento activo y la inscripción esté abierta.",
  };
}

function getEventStatus(isReadOnly: boolean) {
  if (isReadOnly) {
    return {
      label: "Solo lectura",
      className:
        "inline-flex w-fit rounded-md bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800",
    };
  }

  return {
    label: "Contexto editable",
    className:
      "inline-flex w-fit rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800",
  };
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
