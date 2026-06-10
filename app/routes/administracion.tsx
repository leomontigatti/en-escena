import { Link } from "react-router";

import { AccessHeader, AccessPage } from "@/components/access-ui";
import { requireAdminPanelUser } from "@/lib/internal-navigation.server";

import type { Route } from "./+types/administracion";

export const meta: Route.MetaFunction = () => [
  { title: "Panel de administración | En Escena" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireAdminPanelUser(request);

  return { email: user.email };
}

export default function AdministracionRoute({
  loaderData,
}: Route.ComponentProps) {
  return (
    <AccessPage width="xl">
      <AccessHeader
        eyebrow="Panel de administración"
        title="Administración interna"
        description={
          <>
            Acceso activo para{" "}
            <span className="break-words font-medium text-slate-800">
              {loaderData.email}
            </span>
            . Este panel concentrará la operación del evento, sus excepciones y
            los ajustes de administración.
          </>
        }
      />

      <nav
        className="mt-8 grid gap-4 sm:grid-cols-2"
        aria-label="Administración"
      >
        <Link
          to="/administracion/usuarios/invitaciones"
          className="rounded-lg border border-slate-200 bg-slate-50 p-5 transition-colors hover:border-teal-300 hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
        >
          <span className="text-sm font-semibold text-slate-950">
            Invitar usuarios internos
          </span>
          <span className="mt-2 block text-sm leading-6 text-slate-600">
            Habilitá administración, auditoría o juzgamiento por correo.
          </span>
        </Link>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-5">
          <span className="text-sm font-semibold text-slate-950">
            Operación del evento
          </span>
          <span className="mt-2 block text-sm leading-6 text-slate-600">
            Las listas operativas, financieras y de participación se van a sumar
            en próximas iteraciones.
          </span>
        </div>
      </nav>
    </AccessPage>
  );
}
