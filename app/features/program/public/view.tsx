import { LayoutDashboard, LogIn, Printer } from "lucide-react";
import { Link } from "react-router";

import { PortalEmptyState } from "@/components/portal/ui";
import { EnEscenaAvatar } from "@/components/shared/en-escena-avatar";
import { Button } from "@/components/ui/button";
import { ProgramList } from "@/features/program/list";
import { formatScheduleDayLabel } from "@/lib/choreographies/schedule-formatters";

import { PrintableProgram } from "./print";
import type { PublicProgramLoaderData } from "./server";

/**
 * The public program: the order anyone can read without signing in, in the
 * product's first unauthenticated content layout. It shows the same list the
 * academy's portal page shows, with the academy column and without the state —
 * nothing here is anyone's private business.
 */
export function PublicProgramView({
  loaderData,
}: {
  loaderData: PublicProgramLoaderData;
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
            <ProgramList rows={loaderData.rows} showAcademy />
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
        <h1 className="text-xl font-semibold">Programa</h1>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          {name}, del {formatScheduleDayLabel(startsOn)} al{" "}
          {formatScheduleDayLabel(endsOn)}. El orden de las presentaciones puede
          cambiar hasta el día del evento.
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
