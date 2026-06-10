import { Link, redirect } from "react-router";

import { AdminShell } from "@/components/admin-shell";
import { loadAdminEventContext } from "@/lib/admin-event-context.server";
import { requireAdminPanelUser } from "@/lib/internal-navigation.server";

import type { Route } from "./+types/administracion";

type AdministracionRouteProps = {
  loaderData: {
    email: string;
    events: Awaited<ReturnType<typeof loadAdminEventContext>>["events"];
    selectedEventId: string | null;
  };
};

export const meta: Route.MetaFunction = () => [
  { title: "Panel de administración | En Escena" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireAdminPanelUser(request);
  const eventContext = await loadAdminEventContext(request);

  if (eventContext.redirectTo) {
    throw redirect(eventContext.redirectTo);
  }

  return {
    email: user.email,
    events: eventContext.events,
    selectedEventId: eventContext.selectedEventId,
  };
}

export function AdministracionRouteView({
  loaderData,
}: AdministracionRouteProps) {
  return (
    <AdminShell
      email={loaderData.email}
      events={loaderData.events}
      selectedEventId={loaderData.selectedEventId}
      title="Administración interna"
    >
      <section className="space-y-3">
        <p className="max-w-3xl text-sm leading-6 text-slate-600">
          Este panel concentra la operación del Evento, sus excepciones y los
          ajustes de administración.
        </p>
      </section>

      <nav
        className="mt-6 grid gap-4 sm:grid-cols-2"
        aria-label="Accesos de administración"
      >
        <Link
          to="/administracion/eventos"
          className="rounded-lg border border-slate-200 bg-white p-5 transition-colors hover:border-teal-300 hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
        >
          <span className="text-sm font-semibold text-slate-950">Eventos</span>
          <span className="mt-2 block text-sm leading-6 text-slate-600">
            Consultá el contexto de trabajo y prepará la gestión de Eventos.
          </span>
        </Link>
        <Link
          to="/administracion/usuarios/invitaciones"
          className="rounded-lg border border-slate-200 bg-white p-5 transition-colors hover:border-teal-300 hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
        >
          <span className="text-sm font-semibold text-slate-950">
            Invitar usuarios internos
          </span>
          <span className="mt-2 block text-sm leading-6 text-slate-600">
            Habilitá administración, auditoría o juzgamiento por correo.
          </span>
        </Link>
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <span className="text-sm font-semibold text-slate-950">
            Operación del evento
          </span>
          <span className="mt-2 block text-sm leading-6 text-slate-600">
            Las listas operativas, financieras y de participación se van a sumar
            en próximas iteraciones.
          </span>
        </div>
      </nav>
    </AdminShell>
  );
}

export default AdministracionRouteView;
