import {
  Form,
  Link,
  redirect,
  useActionData,
  useLoaderData,
} from "react-router";
import { z } from "zod";

import { resetAccessPassword } from "@/lib/access-recovery.server";

import type { Route } from "./+types/recuperar-acceso.nueva";

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
  { title: "Nueva contraseña | En Escena" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const error = url.searchParams.get("error");

  if (error || !token) {
    return { tokenStatus: "invalid" as const, token: null };
  }

  return { tokenStatus: "valid" as const, token };
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const parsed = resetPasswordSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return {
      status: "error" as const,
      message:
        parsed.error.issues[0]?.message ?? "Revisá los datos del formulario.",
    };
  }

  const result = await resetAccessPassword({
    token: parsed.data.token,
    newPassword: parsed.data.password,
    request,
  });

  if (!result.ok) {
    return { status: "error" as const, message: result.error };
  }

  throw redirect("/ingresar?recuperacion=ok");
}

export default function NuevaContrasenaRoute() {
  const { tokenStatus, token } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  if (tokenStatus === "invalid") {
    return (
      <main className="grid min-h-screen place-items-center bg-stone-100 px-6 py-12">
        <section className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-8 shadow-sm">
          <p className="text-sm font-medium text-red-700">Enlace inválido</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-stone-950">
            No pudimos recuperar tu acceso
          </h1>
          <p className="mt-4 text-sm leading-6 text-stone-600">
            El enlace ya fue usado o expiró. Pedí uno nuevo para definir otra
            contraseña.
          </p>
          <Link
            to="/recuperar-acceso"
            className="mt-8 inline-flex w-full justify-center rounded-xl bg-stone-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-stone-800"
          >
            Pedir nuevo enlace
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="grid min-h-screen place-items-center bg-stone-100 px-6 py-12">
      <section className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-medium text-amber-700">
          Recuperación habilitada
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-stone-950">
          Definí una nueva contraseña
        </h1>
        <p className="mt-4 text-sm leading-6 text-stone-600">
          La recuperación solo cambia tus credenciales. Tus permisos y datos de
          academia no se modifican.
        </p>

        <Form method="post" className="mt-8 space-y-5">
          <input type="hidden" name="token" value={token ?? ""} />

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
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
              {actionData.message}
            </p>
          ) : null}

          <button
            type="submit"
            className="w-full rounded-xl bg-stone-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-stone-800"
          >
            Guardar contraseña
          </button>
        </Form>
      </section>
    </main>
  );
}
