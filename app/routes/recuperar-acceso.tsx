import { Form, Link, useActionData } from "react-router";
import { z } from "zod";

import { requestAccessRecoveryEmail } from "@/lib/access-recovery.server";

import type { Route } from "./+types/recuperar-acceso";

const requestRecoverySchema = z.object({
  email: z.email("Ingresá un correo electrónico válido."),
});

const recoveryMessageClassNameByStatus = {
  error: "rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800",
  success: "rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800",
} as const;

export const meta: Route.MetaFunction = () => [
  { title: "Recuperar acceso | En Escena" },
];

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const parsed = requestRecoverySchema.safeParse({
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return {
      status: "error" as const,
      message: parsed.error.issues[0]?.message ?? "Revisá el correo ingresado.",
    };
  }

  const result = await requestAccessRecoveryEmail({
    email: parsed.data.email,
    requestUrl: request.url,
  });

  return {
    status: "success" as const,
    message: result.message,
  };
}

export default function RecuperarAccesoRoute() {
  const actionData = useActionData<typeof action>();

  return (
    <main className="grid min-h-screen place-items-center bg-stone-100 px-6 py-12">
      <section className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-medium text-amber-700">En Escena</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-stone-950">
          Recuperar acceso
        </h1>
        <p className="mt-4 text-sm leading-6 text-stone-600">
          Ingresá el correo de tu usuario. Si corresponde a una cuenta
          existente, te enviaremos un enlace para definir una nueva contraseña.
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
            <p className={recoveryMessageClassNameByStatus[actionData.status]}>
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
          ¿Recordaste tu contraseña?{" "}
          <Link className="font-medium text-amber-700" to="/ingresar">
            Ingresar
          </Link>
        </p>
      </section>
    </main>
  );
}
