import {
  Form,
  Link,
  redirect,
  useActionData,
  useSearchParams,
} from "react-router";
import { z } from "zod";

import { auth } from "@/lib/auth.server";
import { getLandingPathForUserId } from "@/lib/internal-navigation.server";

import type { Route } from "./+types/ingresar";

const signInSchema = z.object({
  email: z.email("Ingresá un correo electrónico válido."),
  password: z.string().min(1, "Ingresá tu contraseña."),
});

export const meta: Route.MetaFunction = () => [
  { title: "Ingresar | En Escena" },
];

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return {
      status: "error" as const,
      message: parsed.error.issues[0]?.message ?? "Revisá los datos.",
    };
  }

  try {
    const result = await auth.api.signInEmail({
      body: {
        email: parsed.data.email,
        password: parsed.data.password,
        rememberMe: true,
      },
      headers: request.headers,
      returnHeaders: true,
    });

    throw redirect(await getLandingPathForUserId(result.response.user.id), {
      headers: result.headers,
    });
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }

    return {
      status: "error" as const,
      message: "No pudimos ingresar con esos datos.",
    };
  }
}

export default function IngresarRoute() {
  const actionData = useActionData<typeof action>();
  const [searchParams] = useSearchParams();
  const recoveryCompleted = searchParams.get("recuperacion") === "ok";

  return (
    <main className="grid min-h-screen place-items-center bg-stone-100 px-6 py-12">
      <section className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-medium text-amber-700">En Escena</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-stone-950">
          Ingresar
        </h1>
        <p className="mt-4 text-sm leading-6 text-stone-600">
          Accedé al portal de academias o al panel interno según tu permiso.
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

          <label className="block">
            <span className="text-sm font-medium text-stone-800">
              Contraseña
            </span>
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="mt-2 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-stone-950 outline-none transition focus:border-amber-700 focus:ring-4 focus:ring-amber-100"
            />
          </label>

          {actionData ? (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
              {actionData.message}
            </p>
          ) : null}

          {recoveryCompleted ? (
            <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              Tu contraseña fue actualizada. Ya podés ingresar.
            </p>
          ) : null}

          <button
            type="submit"
            className="w-full rounded-xl bg-stone-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-stone-800"
          >
            Ingresar
          </button>
        </Form>

        <p className="mt-6 text-center text-sm text-stone-600">
          ¿No recordás tu contraseña?{" "}
          <Link className="font-medium text-amber-700" to="/recuperar-acceso">
            Recuperar acceso
          </Link>
        </p>

        <p className="mt-3 text-center text-sm text-stone-600">
          ¿Tu academia todavía no está registrada?{" "}
          <Link className="font-medium text-amber-700" to="/registro">
            Pedir enlace
          </Link>
        </p>
      </section>
    </main>
  );
}
