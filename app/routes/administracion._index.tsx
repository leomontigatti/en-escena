import { eq } from "drizzle-orm";
import { Link } from "react-router";
import {
  ClipboardList,
  Music2,
  ShieldUser,
  TriangleAlert,
  Users,
} from "lucide-react";

import { AlertStack } from "@/components/shared/alert-stack";
import {
  HomeAccessCard,
  type HomeAccessCardItem,
} from "@/components/shared/home-access-card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { db } from "@/db";
import { events as eventsTable } from "@/db/schema";
import { requireAdminPanelUser } from "@/lib/auth/internal-navigation.server";
import type { EventRegistrationReadiness } from "@/lib/events/registration-readiness";
import { getEventRegistrationReadiness } from "@/lib/events/registration-readiness.server";

import type { Route } from "./+types/administracion._index";

type ActiveEventSummary = {
  id: string;
  name: string;
};

type AdministracionIndexLoaderData = {
  activeEvent: ActiveEventSummary | null;
  activeEventRegistrationReadiness: EventRegistrationReadiness | null;
};

type AdministracionIndexRouteProps = {
  loaderData: AdministracionIndexLoaderData;
};

export const meta: Route.MetaFunction = () => [
  { title: "Panel de administración | En Escena" },
];

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdminPanelUser(request);

  const activeEvent = await db.query.events.findFirst({
    columns: {
      id: true,
      name: true,
    },
    where: eq(eventsTable.active, true),
  });

  return {
    activeEvent: activeEvent ?? null,
    activeEventRegistrationReadiness: activeEvent
      ? await getEventRegistrationReadiness(activeEvent.id)
      : null,
  } satisfies AdministracionIndexLoaderData;
}

export function AdministracionIndexRouteView({
  loaderData,
}: AdministracionIndexRouteProps) {
  const activeEvent = loaderData.activeEvent;
  const readinessAlertEvent =
    activeEvent !== null &&
    loaderData.activeEventRegistrationReadiness?.isReady === false
      ? activeEvent
      : null;

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Panel de administración
        </h1>
        <p className="text-sm text-muted-foreground">
          Este panel concentra la operación del evento, sus excepciones y la
          configuración principal.
        </p>
      </section>

      <AlertStack>
        {readinessAlertEvent ? (
          <Alert variant="warning">
            <TriangleAlert
              aria-hidden="true"
              className="self-center !translate-y-0"
            />
            <AlertDescription className="flex flex-wrap items-baseline gap-x-1 gap-y-0">
              <span className="font-medium text-foreground">
                Falta configurar bases para el evento activo.
              </span>
              <span>Podés revisarlas acá</span>
              <Link to={`/administracion/eventos/${readinessAlertEvent.id}`}>
                {readinessAlertEvent.name}
              </Link>
              <span>.</span>
            </AlertDescription>
          </Alert>
        ) : null}
      </AlertStack>

      <nav
        className="grid gap-4 sm:grid-cols-2"
        aria-label="Accesos de administración"
      >
        {adminHomeCards.map((card) => (
          <HomeAccessCard key={card.title} item={card} />
        ))}
      </nav>
    </div>
  );
}

export default function AdministracionIndexRoute({
  loaderData,
}: AdministracionIndexRouteProps) {
  return <AdministracionIndexRouteView loaderData={loaderData} />;
}

const adminHomeCards = [
  {
    title: "Resumen",
    description: "Revisá la cuenta corriente de cada academia.",
    icon: ClipboardList,
    to: "/administracion/finanzas",
  },
  {
    title: "Bailarines",
    description:
      "Consultá datos, participación e identificación de Bailarines.",
    icon: Users,
    to: "/administracion/bailarines",
  },
  {
    title: "Coreografías",
    description: "Revisá las coreografías registradas para el evento activo.",
    icon: Music2,
    to: "/administracion/coreografias",
  },
  {
    title: "Usuarios",
    description: "Creá accesos internos y administrá su ingreso inicial.",
    icon: ShieldUser,
    to: "/administracion/usuarios",
  },
] satisfies HomeAccessCardItem[];
