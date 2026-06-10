import { Form, Link, useActionData } from "react-router";
import { z } from "zod";

import { AdminShell } from "@/components/admin-shell";
import {
  internalInvitationRoleLabels,
  internalInvitationRoles,
  isInternalInvitationRole,
} from "@/lib/internal-invitation.shared";
import { createInternalInvitation } from "@/lib/internal-invitation.server";
import { requireAdminPanelUser } from "@/lib/internal-navigation.server";

import type { Route } from "./+types/administracion.usuarios.invitaciones";

const invitationSchema = z.object({
  email: z.email("Ingresá un correo electrónico válido."),
  role: z.string().refine(isInternalInvitationRole, {
    message: "Elegí un permiso interno válido.",
  }),
});

export const meta: Route.MetaFunction = () => [
  { title: "Invitar usuario interno | En Escena" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const appUser = await requireAdminPanelUser(request);

  return { email: appUser.email };
}

export async function action({ request }: Route.ActionArgs) {
  const appUser = await requireAdminPanelUser(request);
  const formData = await request.formData();
  const parsed = invitationSchema.safeParse({
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

  const result = await createInternalInvitation({
    email: parsed.data.email,
    role: parsed.data.role,
    invitedByUserId: appUser.id,
    requestUrl: request.url,
  });

  if (!result.ok) {
    return { status: "error" as const, message: result.error };
  }

  return {
    status: "success" as const,
    message: "Enviamos la invitación al usuario interno.",
  };
}

type InvitacionesInternasRouteProps = {
  loaderData: {
    email: string;
  };
};

export function InvitacionesInternasRouteView({
  loaderData,
}: InvitacionesInternasRouteProps) {
  const actionData = useActionData<typeof action>();

  return (
    <AdminShell
      email={loaderData.email}
      events={[]}
      selectedEventId={null}
      title="Invitar usuario interno"
      showEventSelector={false}
    >
      <section className="max-w-xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm leading-6 text-slate-600">
          La persona invitada recibirá un enlace para confirmar su correo y
          definir su contraseña.
        </p>

        <Form method="post" className="mt-8 space-y-5">
          <label className="block">
            <span className="text-sm font-medium text-slate-800">Correo</span>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              className="mt-2 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none transition focus:border-teal-700 focus:ring-4 focus:ring-teal-100"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-800">
              Permiso principal
            </span>
            <select
              name="role"
              required
              className="mt-2 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none transition focus:border-teal-700 focus:ring-4 focus:ring-teal-100"
            >
              {internalInvitationRoles.map((role) => (
                <option key={role} value={role}>
                  {internalInvitationRoleLabels[role]}
                </option>
              ))}
            </select>
          </label>

          {actionData ? (
            <p
              className={
                actionData.status === "success"
                  ? "rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
                  : "rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800"
              }
            >
              {actionData.message}
            </p>
          ) : null}

          <button
            type="submit"
            className="inline-flex h-10 w-full items-center justify-center rounded-md bg-teal-700 px-4 text-sm font-semibold text-white transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
          >
            Enviar invitación
          </button>
        </Form>

        <Link
          to="/administracion"
          className="mt-8 inline-flex h-10 items-center rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
        >
          Volver al panel
        </Link>
      </section>
    </AdminShell>
  );
}

export default InvitacionesInternasRouteView;
