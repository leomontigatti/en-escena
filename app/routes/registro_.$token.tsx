import {
  Form,
  Link,
  redirect,
  useActionData,
  useLoaderData,
} from "react-router";
import { z } from "zod";

import {
  completeAcademyRegistration,
  getRegistrationTokenStatus,
} from "@/lib/academy-registration.server";

import type { Route } from "./+types/registro_.$token";

const completeRegistrationSchema = z
  .object({
    academyName: z.string().trim().min(1, "Ingresá el nombre de la academia."),
    contactName: z.string().trim().min(1, "Ingresá el nombre de contacto."),
    phone: z.string().trim().min(1, "Ingresá un teléfono de contacto."),
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
  { title: "Completar registro | En Escena" },
];

export async function loader({ params }: Route.LoaderArgs) {
  const token = params.token;

  if (!token) {
    return { tokenStatus: "invalid" as const };
  }

  return { tokenStatus: await getRegistrationTokenStatus(token) };
}

export async function action({ request, params }: Route.ActionArgs) {
  const token = params.token;

  if (!token) {
    return { status: "error" as const, message: "El enlace no es válido." };
  }

  const formData = await request.formData();
  const parsed = completeRegistrationSchema.safeParse({
    academyName: formData.get("academyName"),
    contactName: formData.get("contactName"),
    phone: formData.get("phone"),
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

  const result = await completeAcademyRegistration({
    token,
    academyName: parsed.data.academyName,
    contactName: parsed.data.contactName,
    phone: parsed.data.phone,
    password: parsed.data.password,
    request,
  });

  if (!result.ok) {
    return { status: "error" as const, message: result.error };
  }

  throw redirect("/portal", { headers: result.headers });
}

export default function CompletarRegistroRoute() {
  const { tokenStatus } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  if (tokenStatus === "invalid") {
    return (
      <main className="grid min-h-screen place-items-center bg-stone-100 px-6 py-12">
        <section className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-8 shadow-sm">
          <p className="text-sm font-medium text-red-700">Enlace inválido</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-stone-950">
            No pudimos abrir este registro
          </h1>
          <p className="mt-4 text-sm leading-6 text-stone-600">
            El enlace ya fue usado o expiró. Podés pedir uno nuevo para
            completar el registro de la academia.
          </p>
          <Link
            to="/registro"
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
      <section className="w-full max-w-lg rounded-3xl border border-stone-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-medium text-amber-700">
          Registro habilitado
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-stone-950">
          Completá los datos
        </h1>
        <p className="mt-4 text-sm leading-6 text-stone-600">
          Estos datos pertenecen a la academia. El usuario de acceso queda
          asociado al correo confirmado por el enlace.
        </p>

        <Form method="post" className="mt-8 space-y-5">
          <label className="block">
            <span className="text-sm font-medium text-stone-800">
              Nombre de la academia
            </span>
            <input
              name="academyName"
              required
              autoComplete="organization"
              className="mt-2 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-stone-950 outline-none transition focus:border-amber-700 focus:ring-4 focus:ring-amber-100"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-stone-800">
              Nombre de contacto
            </span>
            <input
              name="contactName"
              required
              autoComplete="name"
              className="mt-2 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-stone-950 outline-none transition focus:border-amber-700 focus:ring-4 focus:ring-amber-100"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-stone-800">Teléfono</span>
            <input
              name="phone"
              required
              autoComplete="tel"
              className="mt-2 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-stone-950 outline-none transition focus:border-amber-700 focus:ring-4 focus:ring-amber-100"
            />
          </label>

          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-stone-800">
                Contraseña
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
          </div>

          {actionData ? (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
              {actionData.message}
            </p>
          ) : null}

          <button
            type="submit"
            className="w-full rounded-xl bg-stone-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-stone-800"
          >
            Crear academia e ingresar
          </button>
        </Form>
      </section>
    </main>
  );
}
