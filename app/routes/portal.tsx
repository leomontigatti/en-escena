import { Link } from "react-router";

import { requireAcademyUser } from "@/lib/internal-access.server";

import type { Route } from "./+types/portal";

export const meta: Route.MetaFunction = () => [
  { title: "Portal de academias | En Escena" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const { user, academy } = await requireAcademyUser(request);

  return {
    email: user.email,
    academy,
  };
}

export default function PortalRoute({ loaderData }: Route.ComponentProps) {
  return (
    <main className="min-h-screen bg-stone-100 px-6 py-12">
      <section className="mx-auto max-w-3xl rounded-3xl border border-stone-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-medium text-amber-700">
          Portal de academias
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-stone-950">
          {loaderData.academy.name}
        </h1>
        <p className="mt-4 text-sm leading-6 text-stone-600">
          Acceso activo para {loaderData.email}. Desde acá se van a cargar
          profesores, bailarines y coreografías.
        </p>

        <dl className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl bg-stone-50 p-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-stone-500">
              Contacto
            </dt>
            <dd className="mt-2 text-sm font-medium text-stone-950">
              {loaderData.academy.contactName}
            </dd>
          </div>
          <div className="rounded-2xl bg-stone-50 p-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-stone-500">
              Teléfono
            </dt>
            <dd className="mt-2 text-sm font-medium text-stone-950">
              {loaderData.academy.phone}
            </dd>
          </div>
        </dl>

        <Link
          to="/"
          className="mt-8 inline-flex rounded-xl border border-stone-300 px-4 py-3 text-sm font-semibold text-stone-800 transition hover:bg-stone-50"
        >
          Volver al inicio
        </Link>
      </section>
    </main>
  );
}
