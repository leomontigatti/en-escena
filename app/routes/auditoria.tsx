import {
  AccessHeader,
  AccessPage,
  PrivateAccessHeader,
} from "@/components/access-ui";
import { requireAuditorPanelUser } from "@/lib/internal-navigation.server";
import { Link } from "react-router";

import type { Route } from "./+types/auditoria";

type AuditoriaRouteProps = Pick<Route.ComponentProps, "loaderData">;

export const meta: Route.MetaFunction = () => [
  { title: "Panel de auditoría | En Escena" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireAuditorPanelUser(request);

  return { email: user.email };
}

export function AuditoriaRouteView({ loaderData }: AuditoriaRouteProps) {
  return (
    <AccessPage width="xl">
      <PrivateAccessHeader email={loaderData.email} />
      <AccessHeader
        eyebrow="Auditoría"
        title="Consulta interna"
        description={
          <>
            Este espacio será de solo lectura para revisar el sistema sin crear,
            editar, publicar ni corregir datos.
          </>
        }
      />

      <div className="mt-8 rounded-lg bg-slate-50 p-5">
        <p className="text-sm font-semibold text-slate-950">
          Vistas de auditoría
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Consultá las vistas compartidas del Panel de administración. Estas
          rutas usan el Evento de trabajo seleccionado y se mantienen en solo
          lectura para Auditoría.
        </p>
      </div>

      <nav
        className="mt-6 grid gap-4 sm:grid-cols-2"
        aria-label="Accesos de auditoría"
      >
        <Link
          to="/administracion/profesores"
          className="rounded-lg border border-slate-200 bg-white p-5 transition-colors hover:border-teal-300 hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
        >
          <span className="text-sm font-semibold text-slate-950">
            Profesores
          </span>
          <span className="mt-2 block text-sm leading-6 text-slate-600">
            Consultá Profesores en la vista compartida del Panel de
            administración, con contexto de Evento de trabajo y sin controles de
            edición.
          </span>
        </Link>
        <Link
          to="/administracion/bailarines"
          className="rounded-lg border border-slate-200 bg-white p-5 transition-colors hover:border-teal-300 hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
        >
          <span className="text-sm font-semibold text-slate-950">
            Bailarines
          </span>
          <span className="mt-2 block text-sm leading-6 text-slate-600">
            Consultá Bailarines en la vista compartida del Panel de
            administración, con contexto de Evento de trabajo y sin controles de
            edición.
          </span>
        </Link>
      </nav>
    </AccessPage>
  );
}

export default AuditoriaRouteView;
