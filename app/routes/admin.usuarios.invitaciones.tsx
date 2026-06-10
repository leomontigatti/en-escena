import { Form, Link, useActionData } from "react-router";
import { z } from "zod";

import { requireAdminUser } from "@/lib/internal-access.server";
import { requestInternalUserInvitation } from "@/lib/internal-user-invitation.server";
import {
  INTERNAL_USER_ROLES,
  type InternalUserRole,
} from "@/lib/internal-user-roles";

import type { Route } from "./+types/admin.usuarios.invitaciones";

const inviteInternalUserSchema = z.object({
  email: z.email("Ingresá un correo electrónico válido."),
  role: z.enum(INTERNAL_USER_ROLES, {
    error: "Elegí un permiso interno válido.",
  }),
});

const roleLabels = {
  admin: "Administración",
  auditor: "Auditoría",
  judge: "Juzgamiento",
} satisfies Record<InternalUserRole, string>;

const roleOptions = INTERNAL_USER_ROLES.map((role) => ({
  label: roleLabels[role],
  value: role,
}));

export const meta: Route.MetaFunction = () => [
  { title: "Invitar usuario interno | En Escena" },
];

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdminUser(request);

  return null;
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdminUser(request);

  const formData = await request.formData();
  const parsed = inviteInternalUserSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role"),
  });

  if (!parsed.success) {
    return {
      status: "error" as const,
      message:
        parsed.error.issues[0]?.message ?? "Revisá los datos de la invitación.",
    };
  }

  await requestInternalUserInvitation({
    email: parsed.data.email,
    role: parsed.data.role,
    requestUrl: request.url,
  });

  return {
    status: "success" as const,
    message: "Enviamos la invitación al correo indicado.",
  };
}

export default function AdminUserInvitationsRoute() {
  const actionData = useActionData<typeof action>();

  return (
    <main className="min-h-screen bg-stone-100 px-6 py-12">
      <section className="mx-auto max-w-2xl rounded-3xl border border-stone-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-medium text-amber-700">
          Panel de administración
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-stone-950">
          Invitar usuario interno
        </h1>
        <p className="mt-4 text-sm leading-6 text-stone-600">
          Enviá un enlace de uso único para que el usuario confirme su correo y
          defina su contraseña.
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
              Permiso principal
            </span>
            <select
              name="role"
              required
              className="mt-2 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-stone-950 outline-none transition focus:border-amber-700 focus:ring-4 focus:ring-amber-100"
            >
              {roleOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
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
            Enviar invitación
          </button>
        </Form>

        <Link
          to="/portal"
          className="mt-8 inline-flex rounded-xl border border-stone-300 px-4 py-3 text-sm font-semibold text-stone-800 transition hover:bg-stone-50"
        >
          Volver al panel
        </Link>
      </section>
    </main>
  );
}
