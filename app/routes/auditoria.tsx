import {
  AccessHeader,
  AccessPage,
  PrivateAccessHeader,
} from "@/components/auth/access-ui";
import { requireAuditorPanelUser } from "@/lib/auth/internal-navigation.server";
import { Link } from "react-router";

import type { Route } from "./+types/auditoria";

type AuditoriaRouteProps = Pick<Route.ComponentProps, "loaderData">;

const auditoriaLinkCardClassName =
  "rounded-lg border border-slate-200 bg-white p-5 transition-colors hover:border-teal-300 hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100";

const auditoriaLinks = [
  {
    to: "/administracion/profesores",
    title: "Profesores",
    description:
      "Consultá Profesores en la vista compartida del Panel de administración, con contexto de Evento activo y sin controles de edición.",
  },
  {
    to: "/administracion/bailarines",
    title: "Bailarines",
    description:
      "Consultá Bailarines en la vista compartida del Panel de administración, con contexto de Evento activo y sin controles de edición.",
  },
] as const;

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
          rutas usan el Evento activo y se mantienen en solo lectura para
          Auditoría.
        </p>
      </div>

      <nav
        className="mt-6 grid gap-4 sm:grid-cols-2"
        aria-label="Accesos de auditoría"
      >
        {auditoriaLinks.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className={auditoriaLinkCardClassName}
          >
            <span className="text-sm font-semibold text-slate-950">
              {link.title}
            </span>
            <span className="mt-2 block text-sm leading-6 text-slate-600">
              {link.description}
            </span>
          </Link>
        ))}
      </nav>
    </AccessPage>
  );
}

export default AuditoriaRouteView;
