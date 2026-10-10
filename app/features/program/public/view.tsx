import { Info, LayoutDashboard, LogIn, Printer, Trophy } from "lucide-react";
import { Link } from "react-router";

import { PortalEmptyState } from "@/components/portal/ui";
import { EnEscenaAvatar } from "@/components/shared/en-escena-avatar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ProgramList } from "@/features/program/list";
import {
  formatScheduleDayLabel,
  formatScheduleDayTabLabel,
} from "@/lib/choreographies/schedule-formatters";
import type { EventProgramCeremonySchedule } from "@/lib/presentations/event-program.server";

import { PrintableProgram, programScheduleNotice } from "./print";
import type { PublicProgramLoaderData } from "./server";

/**
 * The public program: the order anyone can read without signing in, in the
 * product's first unauthenticated content layout. It shows the same list the
 * academy's portal page shows, with the academy column and without the state —
 * nothing here is anyone's private business.
 */
export function PublicProgramView({
  loaderData,
  onLivePoll,
}: {
  loaderData: PublicProgramLoaderData;
  /** Reloads the route's data; the live day's tab asks every minute. */
  onLivePoll?: () => void;
}) {
  const { event } = loaderData;

  return (
    <PublicProgramShell hasAcademySession={loaderData.hasAcademySession}>
      {event ? (
        <>
          <div className="flex flex-col gap-6 print:hidden">
            <PublicProgramHeader
              endsOn={event.endsOn}
              name={event.name}
              startsOn={event.startsOn}
            />
            <Alert variant="info">
              <Info aria-hidden="true" />
              <AlertTitle>Programa sujeto a cambios</AlertTitle>
              <AlertDescription>{programScheduleNotice}</AlertDescription>
            </Alert>
            <ProgramList
              live={loaderData.live}
              onLivePoll={onLivePoll}
              renderDayNotice={(day) => (
                <DayAwardCeremonies
                  day={day}
                  schedules={loaderData.schedules}
                />
              )}
              rows={loaderData.rows}
              showAcademy
            />
          </div>

          <PrintableProgram
            eventName={event.name}
            rows={loaderData.rows}
            schedules={loaderData.schedules}
          />
        </>
      ) : (
        // An unpublished program and no active event read the same on purpose:
        // the public page never says which of the two it is.
        <PortalEmptyState
          title="No hay programa publicado"
          description="La organización todavía no publicó el programa del evento. Volvé a consultar más cerca de la fecha."
        />
      )}
    </PublicProgramShell>
  );
}

/**
 * The public layout, the only one with no session behind it: the product's name
 * over the page's, and the way in for whoever has an account.
 */
function PublicProgramShell({
  children,
  hasAcademySession,
}: {
  children: React.ReactNode;
  hasAcademySession: boolean;
}) {
  return (
    <>
      <a
        href="#contenido-principal"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-4 focus-visible:left-4 focus-visible:z-50 focus-visible:rounded-lg focus-visible:bg-background focus-visible:px-4 focus-visible:py-3 focus-visible:text-sm focus-visible:font-semibold focus-visible:text-foreground focus-visible:shadow-md focus-visible:ring-4 focus-visible:ring-ring/30 focus-visible:outline-none"
      >
        Saltar al contenido principal
      </a>
      <div className="flex min-h-screen flex-col bg-background">
        <header className="border-b border-border bg-background print:hidden">
          <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-4 px-4 py-3">
            <div className="flex items-center gap-2">
              <EnEscenaAvatar />
              <div className="grid text-sm leading-tight">
                <span className="font-medium">En Escena</span>
                <span className="text-xs text-muted-foreground">
                  Programa del evento
                </span>
              </div>
            </div>

            {hasAcademySession ? (
              <Button asChild variant="outline">
                <Link to="/portal/presentaciones">
                  <LayoutDashboard
                    aria-hidden="true"
                    data-icon="inline-start"
                  />
                  Ir al portal
                </Link>
              </Button>
            ) : (
              <Button asChild variant="outline">
                <Link to="/ingresar">
                  <LogIn aria-hidden="true" data-icon="inline-start" />
                  Ingresar
                </Link>
              </Button>
            )}
          </div>
        </header>

        <main id="contenido-principal" className="flex-1 px-4 py-6 print:p-0">
          <div className="mx-auto flex max-w-6xl flex-col gap-6">
            {children}
          </div>
        </main>
      </div>
    </>
  );
}

/** Shaped like `PortalListPage`'s header: title, one line, one action. */
function PublicProgramHeader({
  endsOn,
  name,
  startsOn,
}: {
  endsOn: string;
  name: string;
  startsOn: string;
}) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">Programa</h2>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          {name}, del {formatScheduleDayLabel(startsOn)} al{" "}
          {formatScheduleDayLabel(endsOn)}.
        </p>
      </div>

      <Button
        type="button"
        variant="outline"
        className="print:hidden"
        onClick={() => window.print()}
      >
        <Printer aria-hidden="true" data-icon="inline-start" />
        Imprimir
      </Button>
    </header>
  );
}

/**
 * The award ceremonies of the schedules held on the chosen day, one line
 * each, so the audience knows when a block ends in its ceremony. A ceremony
 * after midnight falls on the next day, and its line says which. Nothing at
 * all when no schedule of the day has one.
 */
function DayAwardCeremonies({
  day,
  schedules,
}: {
  day: string;
  schedules: EventProgramCeremonySchedule[];
}) {
  const ceremonies = schedules.filter(
    (schedule) =>
      schedule.scheduledDate === day &&
      schedule.awardCeremonyDate !== null &&
      schedule.awardCeremonyTime !== null,
  );

  if (ceremonies.length === 0) {
    return null;
  }

  return (
    <ul className="flex flex-col gap-1.5 rounded-lg border bg-muted/40 px-4 py-3 text-sm">
      {ceremonies.map((schedule) => (
        <li key={schedule.id} className="flex items-center gap-2">
          <Trophy
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground"
          />
          <span>
            <span className="font-medium">{schedule.name}</span>
            <span className="text-muted-foreground">
              {` · Entrega de premios ${formatDayAwardCeremonyTime(schedule)}`}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** "13:30 hs", or "Miércoles 2/12 00:15 hs" when it is not the schedule's day. */
function formatDayAwardCeremonyTime(schedule: EventProgramCeremonySchedule) {
  const time = `${schedule.awardCeremonyTime} hs`;

  return schedule.awardCeremonyDate === schedule.scheduledDate ||
    schedule.awardCeremonyDate === null
    ? time
    : `${formatScheduleDayTabLabel(schedule.awardCeremonyDate)} ${time}`;
}
