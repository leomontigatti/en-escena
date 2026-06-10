import { Form, Link, useActionData } from "react-router";
import { z } from "zod";

import { requestAcademyRegistrationEmail } from "@/lib/academy-registration.server";

import type { Route } from "./+types/registro";

const requestRegistrationSchema = z.object({
  email: z.email("Ingresá un correo electrónico válido."),
});

export const meta: Route.MetaFunction = () => [
  { title: "Registro de academia | En Escena" },
];

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const parsed = requestRegistrationSchema.safeParse({
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return {
      status: "error" as const,
      message: parsed.error.issues[0]?.message ?? "Revisá el correo ingresado.",
    };
  }

  await requestAcademyRegistrationEmail({
    email: parsed.data.email,
    requestUrl: request.url,
  });

  return {
    status: "success" as const,
    message:
      "Si el correo puede registrarse, enviamos un enlace para completar el alta.",
  };
}

export default function RegistroRoute() {
  const actionData = useActionData<typeof action>();

  return (
    <main className="grid min-h-screen place-items-center bg-stone-100 px-6 py-12">
      <section className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-medium text-amber-700">
          Portal de academias
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-stone-950">
          Registrá tu academia
        </h1>
        <p className="mt-4 text-sm leading-6 text-stone-600">
          Ingresá tu correo. Te vamos a enviar un enlace de uso único para
          completar los datos de la academia.
        </p>

        <Form method="post" className="mt-8 space-y-5">
          <label className="block">
            <span className="text-sm font-medium text-stone-800">Correo</span>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              className="mt-2 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-stone-950 outline-none transition focus:border-amber-700 focus:ring-4 focus:ring-amber-100"
            />
          </label>

          {actionData ? (
            <p
              className={
                actionData.status === "success"
                  ? "rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
                  : "rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800"
              }
            >
              {actionData.message}
            </p>
          ) : null}

          <button
            type="submit"
            className="w-full rounded-xl bg-stone-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-stone-800"
          >
            Enviar enlace
          </button>
        </Form>

        <p className="mt-6 text-center text-sm text-stone-600">
          ¿Ya tenés usuario?{" "}
          <Link className="font-medium text-amber-700" to="/ingresar">
            Ingresar
          </Link>
        </p>
      </section>
    </main>
  );
}
