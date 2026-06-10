import { requireJudgePanelUser } from "@/lib/internal-navigation.server";

import type { Route } from "./+types/juzgamiento";

export const meta: Route.MetaFunction = () => [
  { title: "Panel de juzgamiento | En Escena" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireJudgePanelUser(request);

  return { email: user.email };
}

export default function JuzgamientoRoute({ loaderData }: Route.ComponentProps) {
  return (
    <main className="min-h-screen bg-stone-100 px-6 py-12">
      <section className="mx-auto max-w-3xl rounded-3xl border border-stone-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-medium text-amber-700">Juzgamiento</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-stone-950">
          Panel de evaluación
        </h1>
        <p className="mt-4 text-sm leading-6 text-stone-600">
          Acceso activo para {loaderData.email}. Las presentaciones asignadas y
          la carga de devoluciones se van a construir en próximas iteraciones.
        </p>

        <div className="mt-8 rounded-2xl bg-stone-50 p-5">
          <p className="text-sm font-semibold text-stone-950">
            Presentaciones asignadas
          </p>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            Todavía no hay una lista disponible para este usuario.
          </p>
        </div>
      </section>
    </main>
  );
}
