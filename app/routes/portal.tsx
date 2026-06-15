import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PortalShell } from "@/components/portal/ui";
import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import { listChoreographiesForAcademyEvent } from "@/lib/portal/choreographies.server";
import { listDancersForAcademy } from "@/lib/portal/dancers.server";
import { getPortalEventContext } from "@/lib/portal/event-context.server";
import { listAcademyProfessors } from "@/lib/portal/professors.server";

import type { Route } from "./+types/portal";

type PortalRouteProps = Pick<Route.ComponentProps, "loaderData">;

type DashboardCardMetric = {
  label: string;
  value: string;
};

export const meta: Route.MetaFunction = () => [
  { title: "Portal de academias | En Escena" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const { user, academy } = await requireAcademyUser(request);
  const eventContext = await getPortalEventContext(request);
  const activeEventId = eventContext.activeEvent?.id ?? null;
  const [professors, dancers, choreographies] = await Promise.all([
    listAcademyProfessors(academy.id, { status: "active" }),
    listDancersForAcademy(academy.id, { status: "active" }),
    activeEventId
      ? listChoreographiesForAcademyEvent(academy.id, activeEventId)
      : Promise.resolve(null),
  ]);

  return {
    email: user.email,
    userName: user.name ?? "",
    academy,
    eventContext,
    dashboardSummary: {
      professors: {
        activeCount: professors.length,
        incompleteCount: professors.filter(
          (professor) => professor.isIncomplete,
        ).length,
      },
      dancers: {
        activeCount: dancers.length,
        incompleteCount: dancers.length,
      },
      choreographies: choreographies
        ? {
            registeredCount: choreographies.length,
            incompleteCount: choreographies.filter(
              (choreography) =>
                choreography.operationalStatus.code === "incomplete",
            ).length,
          }
        : null,
    },
  };
}

export function PortalRouteView({ loaderData }: PortalRouteProps) {
  const { dashboardSummary, eventContext } = loaderData;

  return (
    <PortalShell
      userEmail={loaderData.email}
      userName={loaderData.userName}
      academyName={loaderData.academy.name}
      eventContext={eventContext}
      title="Inicio"
    >
      <section className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Inicio
        </h1>
        <p className="text-sm text-muted-foreground">
          Revisá el estado de los datos de tu academia.
        </p>
      </section>

      <section
        className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
        aria-label="Resumen del portal"
      >
        <DashboardSummaryCard
          title="Profesores"
          description="Controlá cuántos profesores activos todavía tienen datos pendientes."
          metrics={[
            {
              label: "Activos",
              value: String(dashboardSummary.professors.activeCount),
            },
            {
              label: "Incompletos",
              value: String(dashboardSummary.professors.incompleteCount),
            },
          ]}
          to="/portal/profesores"
          actionLabel="Ver profesores"
        />
        <DashboardSummaryCard
          title="Bailarines"
          description="Priorizá los bailarines activos que todavía necesitan completarse."
          metrics={[
            {
              label: "Activos",
              value: String(dashboardSummary.dancers.activeCount),
            },
            {
              label: "Incompletos",
              value: String(dashboardSummary.dancers.incompleteCount),
            },
          ]}
          to="/portal/bailarines"
          actionLabel="Ver bailarines"
        />
        <DashboardSummaryCard
          title="Coreografías"
          description="Seguí el avance de las coreografías del evento activo."
          metrics={
            dashboardSummary.choreographies
              ? [
                  {
                    label: "Registradas",
                    value: String(
                      dashboardSummary.choreographies.registeredCount,
                    ),
                  },
                  {
                    label: "Incompletas",
                    value: String(
                      dashboardSummary.choreographies.incompleteCount,
                    ),
                  },
                ]
              : [{ label: "Sin evento activo", value: "Sin evento activo" }]
          }
          to="/portal/coreografias"
          actionLabel="Ver coreografías"
        />
      </section>
    </PortalShell>
  );
}

function DashboardSummaryCard({
  title,
  description,
  metrics,
  to,
  actionLabel,
}: {
  title: string;
  description: string;
  metrics: DashboardCardMetric[];
  to: string;
  actionLabel: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-4 sm:grid-cols-2">
          {metrics.map((metric) => (
            <div key={metric.label} className="rounded-lg bg-muted/60 p-4">
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {metric.label}
              </dt>
              <dd className="mt-2 text-2xl font-semibold text-foreground">
                {metric.value}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
      <CardFooter>
        <Button asChild>
          <Link to={to}>{actionLabel}</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

export default PortalRouteView;
