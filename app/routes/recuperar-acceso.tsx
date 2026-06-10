import { Form, Link, useActionData, useSearchParams } from "react-router";
import { z } from "zod";

import {
  requestAccessRecoveryEmail,
  resetAccessPassword,
} from "@/lib/access-recovery.server";

import type { Route } from "./+types/recuperar-acceso";

const requestRecoverySchema = z.object({
  email: z.email("Ingresá un correo electrónico válido."),
});

const resetPasswordSchema = z
  .object({
    token: z.string().min(1),
    password: z
      .string()
      .min(8, "La contraseña debe tener al menos 8 caracteres."),
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Las contraseñas no coinciden.",
    path: ["confirmPassword"],
  });

export const meta: Route.MetaFunction = () => [
  { title: "Recuperar acceso | En Escena" },
];

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "reset") {
    const parsed = resetPasswordSchema.safeParse({
      token: formData.get("token"),
      password: formData.get("password"),
      confirmPassword: formData.get("confirmPassword"),
    });

    if (!parsed.success) {
      return {
        status: "error" as const,
        message:
          parsed.error.issues[0]?.message ?? "Revisá la nueva contraseña.",
      };
    }

    const result = await resetAccessPassword({
      token: parsed.data.token,
      password: parsed.data.password,
    });

    if (!result.ok) {
      return { status: "error" as const, message: result.error };
    }

    return {
      status: "success" as const,
      message: "La contraseña fue actualizada. Ya podés ingresar.",
    };
  }

  const parsed = requestRecoverySchema.safeParse({
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return {
      status: "error" as const,
      message: parsed.error.issues[0]?.message ?? "Revisá el correo ingresado.",
    };
  }

  await requestAccessRecoveryEmail({
    email: parsed.data.email,
    requestUrl: request.url,
  });

  return {
    status: "success" as const,
    message:
      "Si el correo existe en En Escena, enviamos un enlace para recuperar el acceso.",
  };
}

export default function RecuperarAccesoRoute() {
  const actionData = useActionData<typeof action>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const invalidToken = searchParams.get("error") === "INVALID_TOKEN";

  if (token) {
    return (
      <main className="grid min-h-screen place-items-center bg-stone-100 px-6 py-12">
        <section className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-8 shadow-sm">
          <p className="text-sm font-medium text-amber-700">
            Recuperación de acceso
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-stone-950">
            Definí una nueva contraseña
          </h1>

          <Form method="post" className="mt-8 space-y-5">
            <input type="hidden" name="intent" value="reset" />
            <input type="hidden" name="token" value={token} />

            <label className="block">
              <span className="text-sm font-medium text-stone-800">
                Nueva contraseña
              </span>
              <input
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                className="mt-2 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-stone-950 outline-none transition focus:border-amber-700 focus:ring-4 focus:ring-amber-100"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-stone-800">
                Confirmar contraseña
              </span>
              <input
                name="confirmPassword"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
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
              Actualizar contraseña
            </button>
          </Form>

          <Link
            className="mt-6 inline-flex w-full justify-center text-sm font-medium text-amber-700"
            to="/ingresar"
          >
            Volver a ingresar
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="grid min-h-screen place-items-center bg-stone-100 px-6 py-12">
      <section className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-medium text-amber-700">
          Recuperación de acceso
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-stone-950">
          Recuperá tu acceso
        </h1>
        <p className="mt-4 text-sm leading-6 text-stone-600">
          Ingresá tu correo. Si existe un usuario, enviaremos un enlace para
          definir una nueva contraseña.
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

          {invalidToken ? (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
              El enlace no es válido o expiró. Pedí uno nuevo.
            </p>
          ) : null}

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

        <Link
          className="mt-6 inline-flex w-full justify-center text-sm font-medium text-amber-700"
          to="/ingresar"
        >
          Volver a ingresar
        </Link>
      </section>
    </main>
  );
}
