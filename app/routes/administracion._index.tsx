import { eq } from "drizzle-orm";
import { Link } from "react-router";
import {
  Building2,
  ClipboardList,
  GraduationCap,
  HandCoins,
  Music2,
  Presentation,
  ShieldUser,
  TriangleAlert,
  Users,
} from "lucide-react";

import { AlertStack } from "@/components/shared/alert-stack";
import {
  HomeAccessCard,
  type HomeAccessCardItem,
} from "@/components/shared/home-access-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { db } from "@/db";
import { events as eventsTable } from "@/db/schema";
import { canWriteInAdminPanel } from "@/lib/auth/admin-panel-access";
import { requireAdminPanelReader } from "@/lib/auth/internal-navigation.server";
import type { EventRegistrationReadiness } from "@/lib/events/registration-readiness";
import { getEventRegistrationReadiness } from "@/lib/events/registration-readiness.server";
import { isEventRegistrationOpen } from "@/lib/schedules/registration-open.server";

import type { Route } from "./+types/administracion._index";

type ActiveEventSummary = {
  id: string;
  name: string;
};

type DashboardLoaderData = {
  activeEvent: ActiveEventSummary | null;
  activeEventRegistrationReadiness: EventRegistrationReadiness | null;
  /** False for the auditor, who gets their own cards and no readiness alerts. */
  canWrite: boolean;
  /** Derived by the event-context owner: any `Cronograma` of the event is open. */
  isRegistrationOpen: boolean;
};

type DashboardRouteProps = {
  loaderData: DashboardLoaderData;
};

export const meta: Route.MetaFunction = () => [
  { title: "Panel de administración | En Escena" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireAdminPanelReader(request);
  const canWrite = canWriteInAdminPanel(user.role);

  // The readiness alerts are a to-do list for whoever configures the event;
  // the auditor cannot act on them, so they are not read at all.
  if (!canWrite) {
    return {
      activeEvent: null,
      activeEventRegistrationReadiness: null,
      canWrite,
      isRegistrationOpen: false,
    } satisfies DashboardLoaderData;
  }

  const activeEvent = await db.query.events.findFirst({
    columns: {
      id: true,
      name: true,
    },
    where: eq(eventsTable.active, true),
  });

  const [activeEventRegistrationReadiness, isRegistrationOpen] =
    await Promise.all([
      activeEvent ? getEventRegistrationReadiness(activeEvent.id) : null,
      isEventRegistrationOpen(activeEvent?.id ?? null),
    ]);

  return {
    activeEvent: activeEvent ?? null,
    activeEventRegistrationReadiness,
    canWrite,
    isRegistrationOpen,
  } satisfies DashboardLoaderData;
}

export function DashboardRouteView({ loaderData }: DashboardRouteProps) {
  const activeEvent = loaderData.activeEvent;
  const isNotReady =
    loaderData.activeEventRegistrationReadiness?.isReady === false;
  const readinessAlertEvent =
    activeEvent !== null && isNotReady ? activeEvent : null;
  /**
   * Opening a `Cronograma` is gated on readiness, but bases changing afterwards
   * closes nothing: this warning is the only signal that the two facts drifted
   * apart, and closing stays a manual action in the schedule detail.
   */
  const warnsAboutOpenSchedules =
    activeEvent !== null && isNotReady && loaderData.isRegistrationOpen;

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          Panel de administración
        </h2>
        <p className="text-sm text-muted-foreground">
          Este panel concentra la operación del evento, sus excepciones y la
          configuración principal.
        </p>
      </section>

      <AlertStack>
        {readinessAlertEvent ? (
          <DashboardWarningAlert
            headline="Falta configurar bases para el evento activo."
            lead="Podés revisarlas acá"
            linkLabel={readinessAlertEvent.name}
            linkTo={`/administracion/eventos/${readinessAlertEvent.id}`}
          />
        ) : null}
        {warnsAboutOpenSchedules ? (
          <DashboardWarningAlert
            headline="Hay cronogramas con las inscripciones abiertas y bases sin configurar."
            lead="Podés cerrarlas acá"
            linkLabel="Cronogramas"
            linkTo="/administracion/cronogramas"
          />
        ) : null}
      </AlertStack>

      <nav
        className="grid gap-4 sm:grid-cols-2"
        aria-label="Accesos de administración"
      >
        {(loaderData.canWrite ? adminHomeCards : auditorHomeCards).map(
          (card) => (
            <HomeAccessCard key={card.title} item={card} />
          ),
        )}
      </nav>
    </div>
  );
}

function DashboardWarningAlert({
  headline,
  lead,
  linkLabel,
  linkTo,
}: {
  headline: string;
  lead: string;
  linkLabel: string;
  linkTo: string;
}) {
  return (
    <Alert variant="warning">
      <TriangleAlert aria-hidden="true" />
      <AlertTitle>{headline}</AlertTitle>
      <AlertDescription>
        {lead} <Link to={linkTo}>{linkLabel}</Link>.
      </AlertDescription>
    </Alert>
  );
}

export default function DashboardRoute({ loaderData }: DashboardRouteProps) {
  return <DashboardRouteView loaderData={loaderData} />;
}

const adminHomeCards = [
  {
    title: "Finanzas",
    description: "Revisá los saldos de cada academia.",
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

/** The auditor's sections, the same closed list as their navigation. */
const auditorHomeCards = [
  {
    title: "Academias",
    description: "Consultá los datos y el contacto de cada academia.",
    icon: Building2,
    to: "/administracion/academias",
  },
  {
    title: "Bailarines",
    description:
      "Consultá datos, participación e identificación de bailarines.",
    icon: Users,
    to: "/administracion/bailarines",
  },
  {
    title: "Profesores",
    description: "Consultá los profesores de cada academia.",
    icon: GraduationCap,
    to: "/administracion/profesores",
  },
  {
    title: "Coreografías",
    description: "Revisá las coreografías registradas para el evento activo.",
    icon: Music2,
    to: "/administracion/coreografias",
  },
  {
    title: "Pagos",
    description: "Revisá los pagos registrados para el evento activo.",
    icon: HandCoins,
    to: "/administracion/pagos",
  },
  {
    title: "Seminarios",
    description:
      "Consultá los seminarios del evento activo y exportá sus inscriptos.",
    icon: Presentation,
    to: "/administracion/seminarios",
  },
] satisfies HomeAccessCardItem[];
