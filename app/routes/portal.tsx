import { Link } from "react-router";

import {
  AccessHeader,
  AccessPage,
  accessSecondaryLinkClassName,
} from "@/components/access-ui";
import { requireAcademyUser } from "@/lib/internal-access.server";

import type { Route } from "./+types/portal";

export const meta: Route.MetaFunction = () => [
  { title: "Portal de academias | En Escena" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const { user, academy } = await requireAcademyUser(request);

  return {
    email: user.email,
    academy,
  };
}

export default function PortalRoute({ loaderData }: Route.ComponentProps) {
  return (
    <AccessPage width="xl">
      <AccessHeader
        eyebrow="Portal de academias"
        title={loaderData.academy.name}
        description={
          <>
            Acceso activo para{" "}
            <span className="break-words font-medium text-slate-800">
              {loaderData.email}
            </span>
            . Desde acá se van a gestionar profesores, bailarines y coreografías
            de la academia.
          </>
        }
      />

      <dl className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg bg-slate-50 p-4">
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Contacto
          </dt>
          <dd className="mt-2 break-words text-sm font-medium text-slate-950">
            {loaderData.academy.contactName}
          </dd>
        </div>
        <div className="rounded-lg bg-slate-50 p-4">
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Teléfono
          </dt>
          <dd className="mt-2 break-words text-sm font-medium text-slate-950">
            {loaderData.academy.phone}
          </dd>
        </div>
      </dl>

      <Link to="/" className={`${accessSecondaryLinkClassName} mt-8`}>
        Volver al inicio
      </Link>
    </AccessPage>
  );
}
