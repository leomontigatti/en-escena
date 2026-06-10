import { Link } from "react-router";

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
    <main className="min-h-screen bg-stone-100 px-6 py-12">
      <section className="mx-auto max-w-4xl rounded-3xl border border-stone-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-medium text-amber-700">
          Panel de administración
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-stone-950">
          Administración interna
        </h1>
        <p className="mt-4 text-sm leading-6 text-stone-600">
          Acceso activo para {loaderData.email}. Desde acá se van a operar el
          evento, sus excepciones y la configuración interna.
        </p>

        <nav className="mt-8 grid gap-4 sm:grid-cols-2">
          <Link
            to="/administracion/usuarios/invitaciones"
            className="rounded-2xl border border-stone-200 bg-stone-50 p-5 transition hover:border-amber-300 hover:bg-amber-50"
          >
            <span className="text-sm font-semibold text-stone-950">
              Invitar usuarios internos
            </span>
            <span className="mt-2 block text-sm leading-6 text-stone-600">
              Habilitá administración, auditoría o juzgamiento por correo.
            </span>
          </Link>
          <div className="rounded-2xl border border-stone-200 bg-stone-50 p-5">
            <span className="text-sm font-semibold text-stone-950">
              Operación del evento
            </span>
            <span className="mt-2 block text-sm leading-6 text-stone-600">
              Las vistas de coreografías, pagos y ajustes se van a construir en
              las próximas iteraciones.
            </span>
          </div>
        </nav>
      </section>
    </main>
  );
}
