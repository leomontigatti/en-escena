import type { ReactNode } from "react";
import { NavLink } from "react-router";
import { clsx } from "clsx";

import {
  AccessHeader,
  AccessPage,
  PrivateAccessHeader,
} from "@/components/access-ui";
import type { PortalEventContext } from "@/lib/portal-event-context";

type PortalShellProps = {
  email: string;
  academyName: string;
  description: ReactNode;
  children: ReactNode;
};

type CoreographyCreationState = {
  tone: "ready" | "blocked" | "info";
  message: string;
  details: string[];
};

const portalNavigationItems = [
  { to: "/portal", label: "Inicio", end: true },
  { to: "/portal/bailarines", label: "Bailarines", end: false },
  { to: "/portal/profesores", label: "Profesores", end: false },
  { to: "/portal/coreografias", label: "Coreografías", end: false },
] as const;

const creationAvailabilityToneClassNames: Record<
  CoreographyCreationState["tone"],
  string
> = {
  ready: "bg-emerald-50 text-emerald-900",
  blocked: "bg-amber-50 text-amber-900",
  info: "bg-slate-50 text-slate-700",
};

export function PortalShell({
  email,
  academyName,
  description,
  children,
}: PortalShellProps) {
  return (
    <AccessPage width="xl">
      <PrivateAccessHeader email={email} />
      <AccessHeader
        eyebrow="Portal de academias"
        title={academyName}
        description={description}
      />
      <PortalNavigation />
      {children}
    </AccessPage>
  );
}

function PortalNavigation() {
  return (
    <nav
      aria-label="Secciones del portal"
      className="mt-8 flex gap-2 overflow-x-auto border-b border-slate-200 pb-2"
    >
      {portalNavigationItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            clsx(
              "inline-flex h-9 shrink-0 items-center rounded-md px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100",
              isActive
                ? "bg-teal-50 text-teal-900"
                : "text-slate-700 hover:bg-slate-50 hover:text-slate-950",
            )
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

type PortalEmptyListProps = {
  title: string;
  description: string;
};

export function PortalEmptyList({ title, description }: PortalEmptyListProps) {
  return (
    <div className="mt-6 rounded-lg border border-slate-200 bg-white p-6">
      <h2 className="text-base font-semibold text-slate-950">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
    </div>
  );
}

type PortalEmptyListSectionProps = {
  title: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
};

export function PortalEmptyListSection({
  title,
  description,
  emptyTitle,
  emptyDescription,
}: PortalEmptyListSectionProps) {
  const titleId = `${title.toLowerCase()}-title`;

  return (
    <section className="mt-8" aria-labelledby={titleId}>
      <div>
        <p id={titleId} className="text-sm font-semibold text-slate-950">
          {title}
        </p>
        <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
      </div>
      <PortalEmptyList title={emptyTitle} description={emptyDescription} />
    </section>
  );
}

export function PortalCoreographiesSection({
  eventContext,
}: {
  eventContext: PortalEventContext;
}) {
  const selectedEvent = eventContext.selectedEvent;
  const creationAvailability = getCoreographyCreationState(eventContext);
  const eventStatus = getPortalEventStatus(eventContext.isReadOnly);

  return (
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
              <span className={eventStatus.className}>{eventStatus.label}</span>
            </div>
            <div
              className={clsx(
                "mt-4 rounded-lg px-4 py-3 text-sm leading-6",
                creationAvailabilityToneClassNames[creationAvailability.tone],
              )}
            >
              <p>{creationAvailability.message}</p>
              {creationAvailability.details.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {creationAvailability.details.map((detail) => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
              ) : null}
            </div>
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
  );
}

function getPortalEventStatus(isReadOnly: boolean) {
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

function getCoreographyCreationState(
  eventContext: PortalEventContext,
): CoreographyCreationState {
  if (!eventContext.hasActiveEvent) {
    return {
      tone: "blocked",
      message: "Todavía no hay un Evento activo para registrar coreografías.",
      details: [],
    };
  }

  const activeEventReadiness = eventContext.activeEventRegistrationReadiness;

  if (activeEventReadiness?.isReady === false) {
    return {
      tone: "blocked",
      message:
        "El Evento activo todavía no tiene la configuración mínima para registrar coreografías.",
      details: activeEventReadiness.missingItems.map((item) => item.detail),
    };
  }

  const canCreateCoreographies =
    eventContext.selectedEvent !== null &&
    !eventContext.isReadOnly &&
    eventContext.isRegistrationOpen &&
    activeEventReadiness?.isReady === true;

  if (canCreateCoreographies) {
    return {
      tone: "ready",
      message:
        "La creación de coreografías va a estar disponible para este Evento mientras la inscripción esté abierta.",
      details: [],
    };
  }

  return {
    tone: "info",
    message:
      "La creación de coreografías va a estar disponible solo cuando el Evento consultado sea el Evento activo y la inscripción esté abierta.",
    details: [],
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
