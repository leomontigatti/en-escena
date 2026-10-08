import { ChevronLeft } from "lucide-react";
import { type ErrorResponse, isRouteErrorResponse, Link } from "react-router";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";

const genericErrorDescription = "La aplicación no pudo completar la solicitud.";

/**
 * Whether React Router built this error response itself instead of a loader or
 * an action throwing one. `isRouteErrorResponse` requires the `internal` flag
 * at runtime but narrows to `ErrorResponse`, which does not declare it, so it
 * is read through a local type. Should the flag ever go away, this reads as
 * "not internal" and the internal-404 test fails loudly.
 */
function isBuiltByRouter(error: ErrorResponse) {
  return (error as { internal?: boolean }).internal === true;
}

/**
 * Picks the copy an error boundary shows for a thrown value.
 *
 * A `Response` thrown by a loader or an action reaches us as an error response
 * whose body is in `data` and whose `statusText` is empty, so that body — the
 * refusal the user is meant to read — comes first.
 *
 * Two kinds of `data` are deliberately skipped. A non-string body (a JSON
 * `data(...)`) would print as `[object Object]`. And React Router builds its
 * own error responses with `internal: true` and an `Error` whose message it
 * stringifies into `data`, so an unknown URL arrives carrying `Error: No route
 * matches URL "/..."` — English developer text naming route ids and paths,
 * never copy for a user. Both fall through to `statusText`, which is what the
 * boundary showed before it read `data` at all.
 */
export function getErrorBoundaryCopy(error: unknown) {
  if (isRouteErrorResponse(error)) {
    const thrownMessage =
      !isBuiltByRouter(error) && typeof error.data === "string"
        ? error.data
        : "";

    return {
      title:
        error.status === 404 ? "Página no encontrada" : `Error ${error.status}`,
      description: thrownMessage || error.statusText || genericErrorDescription,
    };
  }

  if (error instanceof Error) {
    return { title: "Ocurrió un error", description: error.message };
  }

  return { title: "Ocurrió un error", description: genericErrorDescription };
}

/**
 * The error a layout's boundary shows in the slot its `<Outlet />` fills, so
 * the shell's navigation stays usable. `homeHref` is the shell's home.
 */
export function ErrorPanel({
  error,
  homeHref,
}: {
  error: unknown;
  homeHref: string;
}) {
  const { title, description } = getErrorBoundaryCopy(error);

  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button asChild variant="outline">
          <Link to={homeHref}>
            <ChevronLeft aria-hidden="true" data-icon="inline-start" />
            Volver
          </Link>
        </Button>
      </EmptyContent>
    </Empty>
  );
}

/**
 * The whole-screen error, for when no shell can render around it: the root
 * boundary, and a layout whose own loader failed.
 */
export function ErrorScreen({ error }: { error: unknown }) {
  const { title, description } = getErrorBoundaryCopy(error);

  return (
    <main className="grid min-h-screen place-items-center px-6">
      <section className="w-full max-w-lg rounded-lg border border-border bg-card p-6 text-card-foreground shadow-sm">
        <p className="text-sm font-medium text-muted-foreground">En Escena</p>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </section>
    </main>
  );
}
