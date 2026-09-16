import {
  data,
  type ErrorResponse,
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";
import { useEffect } from "react";
import { Toaster } from "sonner";

import type { Route } from "./+types/root";
import "./app.css";
import { readFlashNotification } from "@/lib/shared/flash-notification.server";
import { showToastMessage, type ToastMessage } from "@/lib/shared/toasts";

export const links: Route.LinksFunction = () => [
  {
    rel: "icon",
    href: "/favicon-96x96.png",
    type: "image/png",
    sizes: "96x96",
  },
  {
    rel: "icon",
    href: "/favicon.svg",
    type: "image/svg+xml",
  },
  {
    rel: "shortcut icon",
    href: "/favicon.ico",
  },
  {
    rel: "apple-touch-icon",
    href: "/apple-touch-icon.png",
    sizes: "180x180",
  },
  {
    rel: "manifest",
    href: "/site.webmanifest",
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="apple-mobile-web-app-title" content="En Escena" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export async function loader({ request }: Route.LoaderArgs) {
  const flash = await readFlashNotification(request);

  if (!flash) {
    return data({ flashToast: null });
  }

  // Consume the flash cookie (one-time): the `Set-Cookie` the reader returns
  // clears it, so the toast appears once and does not come back on a reload.
  return data(
    { flashToast: flash.toast },
    { headers: { "set-cookie": flash.setCookieHeader } },
  );
}

export default function App({ loaderData }: Route.ComponentProps) {
  return (
    <>
      <Toaster richColors position="top-center" />
      <Outlet />
      <FlashToast toast={loaderData.flashToast} />
    </>
  );
}

function FlashToast({ toast }: { toast: ToastMessage | null }) {
  const toastId = toast?.id;

  useEffect(() => {
    if (!toast) {
      return;
    }

    window.setTimeout(() => {
      showToastMessage(toast);
    }, 0);
    // It fires exactly once per flash message: the cookie was already consumed in
    // the loader, so a later revalidation returns `flashToast: null`.
  }, [toast, toastId]);

  return null;
}

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
 * Picks the copy the root boundary shows for a thrown value.
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

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
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
