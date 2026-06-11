import type { ReactNode } from "react";
import { CalendarDays, MailPlus, LogOut, Settings } from "lucide-react";
import { Link } from "react-router";
import { clsx } from "clsx";

import type { AdminEventOption } from "@/lib/admin-event-context.shared";

type AdminShellProps = {
  email: string;
  events: AdminEventOption[];
  selectedEventId: string | null;
  title: string;
  children: ReactNode;
  showEventSelector?: boolean;
};

const navigationItems = [
  {
    label: "Eventos",
    to: "/administracion/eventos",
    icon: CalendarDays,
  },
  {
    label: "Ajustes",
    to: "/administracion/ajustes",
    icon: Settings,
  },
  {
    label: "Invitaciones",
    to: "/administracion/usuarios/invitaciones",
    icon: MailPlus,
  },
];

export function AdminShell({
  email,
  events,
  selectedEventId,
  title,
  children,
  showEventSelector = true,
}: AdminShellProps) {
  const selectedEvent =
    events.find((event) => event.id === selectedEventId) ?? null;
  const showMissingActiveEvent = showEventSelector && !selectedEvent;
  const showLimitedOperation =
    showEventSelector && selectedEvent !== null && !selectedEvent.active;

  return (
    <>
      <a
        href="#contenido-principal"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-4 focus-visible:z-50 focus-visible:rounded-lg focus-visible:bg-white focus-visible:px-4 focus-visible:py-3 focus-visible:text-sm focus-visible:font-semibold focus-visible:text-slate-950 focus-visible:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
      >
        Saltar al contenido principal
      </a>
      <div className="min-h-screen bg-slate-100 text-slate-950 lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
        <aside className="border-b border-slate-200 bg-white px-4 py-4 lg:border-b-0 lg:border-r lg:px-5 lg:py-6">
          <Link
            to="/administracion"
            className="block rounded-md text-sm font-semibold text-slate-950 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
          >
            En Escena
          </Link>
          <p className="mt-1 text-xs font-medium uppercase text-slate-500">
            Panel de administración
          </p>
          <nav
            className="mt-5 flex gap-2 overflow-x-auto lg:block lg:space-y-1"
            aria-label="Administración"
          >
            {navigationItems.map((item) => {
              const Icon = item.icon;

              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100 lg:flex"
                >
                  <Icon aria-hidden="true" className="size-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        <div className="min-w-0">
          <header className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-medium uppercase text-slate-500">
                  Panel de administración
                </p>
                <h1 className="mt-1 text-2xl font-semibold text-slate-950">
                  {title}
                </h1>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="text-sm leading-5 text-slate-600">
                  Sesión activa para{" "}
                  <span className="break-words font-medium text-slate-800">
                    {email}
                  </span>
                </div>
                <form action="/salir" method="post">
                  <button
                    type="submit"
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
                  >
                    <LogOut aria-hidden="true" className="size-4" />
                    <span>Salir</span>
                  </button>
                </form>
              </div>
            </div>

            {showEventSelector ? (
              <div className="mt-5 flex flex-col gap-3 border-t border-slate-200 pt-4 lg:flex-row lg:items-end lg:justify-between">
                <form method="get" className="max-w-sm">
                  <label
                    htmlFor="admin-evento-trabajo"
                    className="block text-sm font-medium text-slate-800"
                  >
                    Evento de trabajo
                  </label>
                  <select
                    id="admin-evento-trabajo"
                    name="evento"
                    value={selectedEventId ?? ""}
                    onChange={(event) =>
                      event.currentTarget.form?.requestSubmit()
                    }
                    className="mt-2 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-teal-700 focus:ring-4 focus:ring-teal-100"
                  >
                    {events.length === 0 ? (
                      <option value="">No hay eventos creados</option>
                    ) : null}
                    {events.map((event) => (
                      <option key={event.id} value={event.id}>
                        {event.name}
                        {event.active ? " (activo)" : ""}
                      </option>
                    ))}
                  </select>
                </form>

                {showMissingActiveEvent ? (
                  <AdminShellBanner tone="warning">
                    No hay evento activo.
                  </AdminShellBanner>
                ) : null}
                {showLimitedOperation ? (
                  <AdminShellBanner tone="info">
                    Estás editando un Evento de trabajo que no es el Evento
                    activo.
                  </AdminShellBanner>
                ) : null}
              </div>
            ) : null}
          </header>

          <main id="contenido-principal" className="px-4 py-6 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-6xl">{children}</div>
          </main>
        </div>
      </div>
    </>
  );
}

type AdminShellBannerProps = {
  children: ReactNode;
  tone: "info" | "warning";
};

function AdminShellBanner({ children, tone }: AdminShellBannerProps) {
  return (
    <p
      className={clsx(
        "rounded-lg border px-4 py-3 text-sm leading-5",
        tone === "info" && "border-sky-200 bg-sky-50 text-sky-900",
        tone === "warning" && "border-amber-200 bg-amber-50 text-amber-900",
      )}
    >
      {children}
    </p>
  );
}
