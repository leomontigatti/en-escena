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

type ProfessorSummaryItem = Awaited<
  ReturnType<typeof listAcademyProfessors>
>[number];
type DancerSummaryItem = Awaited<
  ReturnType<typeof listDancersForAcademy>
>[number];
type ChoreographySummaryItem = Awaited<
  ReturnType<typeof listChoreographiesForAcademyEvent>
>[number];

type DashboardSummary = {
  professors: {
    activeCount: number;
    incompleteCount: number;
  };
  dancers: {
    activeCount: number;
    incompleteCount: number;
  };
  choreographies: {
    registeredCount: number;
    incompleteCount: number;
  } | null;
};

type DashboardCardMetric = {
  label: string;
  value: string;
};

type DashboardCardConfig = {
  title: string;
  description: string;
  metrics: DashboardCardMetric[];
  to: string;
  actionLabel: string;
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
    dashboardSummary: buildDashboardSummary(
      professors,
      dancers,
      choreographies,
    ),
  };
}

export function PortalRouteView({ loaderData }: PortalRouteProps) {
  const { dashboardSummary, eventContext } = loaderData;
  const dashboardCards = getDashboardCards(dashboardSummary);

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
        {dashboardCards.map((card) => (
          <DashboardSummaryCard key={card.to} {...card} />
        ))}
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
}: DashboardCardConfig) {
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

function buildDashboardSummary(
  professors: ProfessorSummaryItem[],
  dancers: DancerSummaryItem[],
  choreographies: ChoreographySummaryItem[] | null,
): DashboardSummary {
  return {
    professors: {
      activeCount: professors.length,
      incompleteCount: professors.filter((professor) => professor.isIncomplete)
        .length,
    },
    dancers: {
      activeCount: dancers.length,
      incompleteCount: dancers.length,
    },
    choreographies: buildChoreographySummary(choreographies),
  };
}

function buildChoreographySummary(
  choreographies: ChoreographySummaryItem[] | null,
): DashboardSummary["choreographies"] {
  if (!choreographies) {
    return null;
  }

  return {
    registeredCount: choreographies.length,
    incompleteCount: choreographies.filter(
      (choreography) => choreography.operationalStatus.code === "incomplete",
    ).length,
  };
}

function getDashboardCards(summary: DashboardSummary): DashboardCardConfig[] {
  return [
    {
      title: "Profesores",
      description:
        "Controlá cuántos profesores activos todavía tienen datos pendientes.",
      metrics: [
        {
          label: "Activos",
          value: String(summary.professors.activeCount),
        },
        {
          label: "Incompletos",
          value: String(summary.professors.incompleteCount),
        },
      ],
      to: "/portal/profesores",
      actionLabel: "Ver profesores",
    },
    {
      title: "Bailarines",
      description:
        "Priorizá los bailarines activos que todavía necesitan completarse.",
      metrics: [
        {
          label: "Activos",
          value: String(summary.dancers.activeCount),
        },
        {
          label: "Incompletos",
          value: String(summary.dancers.incompleteCount),
        },
      ],
      to: "/portal/bailarines",
      actionLabel: "Ver bailarines",
    },
    {
      title: "Coreografías",
      description: "Seguí el avance de las coreografías del evento activo.",
      metrics: getChoreographyMetrics(summary.choreographies),
      to: "/portal/coreografias",
      actionLabel: "Ver coreografías",
    },
  ];
}

function getChoreographyMetrics(
  choreographies: DashboardSummary["choreographies"],
): DashboardCardMetric[] {
  if (!choreographies) {
    return [{ label: "Sin evento activo", value: "Sin evento activo" }];
  }

  return [
    {
      label: "Registradas",
      value: String(choreographies.registeredCount),
    },
    {
      label: "Incompletas",
      value: String(choreographies.incompleteCount),
    },
  ];
}

export default PortalRouteView;
