import { AccessSecondaryLink } from "@/components/auth/access-ui";
import {
  PortalCoreographiesSection,
  PortalShell,
} from "@/components/portal/ui";
import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import { getPortalEventContext } from "@/lib/portal/event-context.server";
import { Link } from "react-router";

import type { Route } from "./+types/portal";

type PortalRouteProps = Pick<Route.ComponentProps, "loaderData">;

export const meta: Route.MetaFunction = () => [
  { title: "Portal de academias | En Escena" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const { user, academy } = await requireAcademyUser(request);
  const eventContext = await getPortalEventContext(request);

  return {
    email: user.email,
    academy,
    eventContext,
  };
}

export function PortalRouteView({ loaderData }: PortalRouteProps) {
  const { eventContext } = loaderData;

  return (
    <PortalShell
      email={loaderData.email}
      academyName={loaderData.academy.name}
      description={
        <>
          Desde acá se van a gestionar profesores, bailarines y coreografías de
          la academia.
        </>
      }
    >
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

      <AcademyAreasSection />

      <PortalCoreographiesSection eventContext={eventContext} />

      <AccessSecondaryLink to="/" className="mt-8">
        Volver al inicio
      </AccessSecondaryLink>
    </PortalShell>
  );
}

function AcademyAreasSection() {
  return (
    <section className="mt-8" aria-labelledby="areas-academia-title">
      <div>
        <p
          id="areas-academia-title"
          className="text-sm font-semibold text-slate-950"
        >
          Áreas de la academia
        </p>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          Profesores y bailarines se gestionan como datos de la academia,
          incluso cuando no hay Evento activo.
        </p>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <AcademyAreaCard
          title="Profesores"
          to="/portal/profesores"
          linkLabel="Ver profesores"
        >
          Consultá los profesores cargados para vincularlos a coreografías.
        </AcademyAreaCard>
        <AcademyAreaCard
          title="Bailarines"
          to="/portal/bailarines"
          linkLabel="Ver bailarines"
        >
          Consultá los bailarines cargados para usarlos en coreografías.
        </AcademyAreaCard>
      </div>
    </section>
  );
}

function AcademyAreaCard({
  title,
  to,
  linkLabel,
  children,
}: {
  title: string;
  to: string;
  linkLabel: string;
  children: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <h2 className="text-sm font-semibold text-slate-950">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{children}</p>
      <Link
        to={to}
        className="mt-4 inline-flex text-sm font-semibold text-teal-700 underline-offset-4 hover:text-teal-900 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
      >
        {linkLabel}
      </Link>
    </div>
  );
}

export default PortalRouteView;
