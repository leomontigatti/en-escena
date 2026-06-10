import { AdminShell } from "@/components/admin-shell";
import {
  loadAdminEventContext,
  type AdminEventContext,
} from "@/lib/admin-event-context.server";
import { requireAdminPanelUser } from "@/lib/internal-navigation.server";

import type { Route } from "./+types/administracion.eventos";

type AdministracionEventosRouteProps = {
  loaderData: {
    email: string;
    events: AdminEventContext["events"];
  };
};

export const meta: Route.MetaFunction = () => [
  { title: "Eventos | Panel de administración | En Escena" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireAdminPanelUser(request);
  const eventContext = await loadAdminEventContext(request);

  return {
    email: user.email,
    events: eventContext.events,
  };
}

export default function AdministracionEventosRoute({
  loaderData,
}: AdministracionEventosRouteProps) {
  return (
    <AdminShell
      email={loaderData.email}
      events={loaderData.events}
      selectedEventId={null}
      title="Eventos"
      showEventSelector={false}
    >
      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-950">
            Ajustes de Eventos
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            La gestión completa de Eventos se va a sumar en la próxima
            iteración. Esta vista deja disponible la navegación operativa del
            panel.
          </p>
        </div>

        {loaderData.events.length > 0 ? (
          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
            {loaderData.events.map((event) => (
              <li
                key={event.id}
                className="flex items-center justify-between gap-4 px-4 py-3"
              >
                <span className="text-sm font-medium text-slate-950">
                  {event.name}
                </span>
                <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700">
                  {event.active ? "Activo" : "Inactivo"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
            No hay evento activo.
          </p>
        )}
      </section>
    </AdminShell>
  );
}
