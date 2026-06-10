import { eq } from "drizzle-orm";
import { Link, redirect } from "react-router";

import { db } from "@/db";
import { academies, user } from "@/db/schema";
import { auth } from "@/lib/auth.server";

import type { Route } from "./+types/portal";

export const meta: Route.MetaFunction = () => [
  { title: "Portal de academias | En Escena" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session) {
    throw redirect("/ingresar");
  }

  const appUser = await db.query.user.findFirst({
    columns: { id: true, email: true, role: true },
    where: eq(user.id, session.user.id),
  });

  if (!appUser) {
    throw redirect("/ingresar");
  }

  if (appUser.role !== "academy") {
    return {
      kind: "internal" as const,
      email: appUser.email,
      role: appUser.role,
    };
  }

  const academy = await db.query.academies.findFirst({
    columns: { name: true, contactName: true, phone: true },
    where: eq(academies.userId, appUser.id),
  });

  return {
    kind: "academy" as const,
    email: appUser.email,
    academy,
  };
}

export default function PortalRoute({ loaderData }: Route.ComponentProps) {
  if (loaderData.kind === "internal") {
    return (
      <main className="min-h-screen bg-stone-100 px-6 py-12">
        <section className="mx-auto max-w-3xl rounded-3xl border border-stone-200 bg-white p-8 shadow-sm">
          <p className="text-sm font-medium text-amber-700">Usuario interno</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-stone-950">
            Acceso interno pendiente
          </h1>
          <p className="mt-4 text-sm leading-6 text-stone-600">
            Ingresaste como {loaderData.email} con permiso {loaderData.role}.
            Las vistas internas se van a construir en próximos slices.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-stone-100 px-6 py-12">
      <section className="mx-auto max-w-3xl rounded-3xl border border-stone-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-medium text-amber-700">
          Portal de academias
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-stone-950">
          {loaderData.academy?.name ?? "Academia"}
        </h1>
        <p className="mt-4 text-sm leading-6 text-stone-600">
          Acceso activo para {loaderData.email}. Desde acá se van a cargar
          profesores, bailarines y coreografías.
        </p>

        {loaderData.academy ? (
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
        ) : (
          <p className="mt-8 rounded-2xl bg-red-50 p-4 text-sm text-red-800">
            Este usuario no tiene una academia vinculada.
          </p>
        )}

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
