import type { Route } from "./+types/_index";

export const meta: Route.MetaFunction = () => [
  { title: "En Escena" },
  {
    name: "description",
    content: "Gestión integral de competencias de danza.",
  },
];

const modules = [
  "Eventos",
  "Academias",
  "Coreografías",
  "Cronogramas",
  "Pagos",
  "Puntajes",
];

export default function IndexRoute() {
  return (
    <main className="min-h-screen bg-slate-50">
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex min-h-64 max-w-6xl flex-col justify-end px-6 py-10">
          <p className="text-sm font-medium text-slate-500">Stack inicial</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-normal text-slate-950">
            En Escena
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
            Base técnica para construir el portal de academias, el panel de
            administración y las vistas públicas de programa y resultados.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-8">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {modules.map((module) => (
            <article
              key={module}
              className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
            >
              <h2 className="text-sm font-semibold text-slate-950">{module}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Módulo preparado para definir flujos, permisos y reglas del
                dominio.
              </p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
