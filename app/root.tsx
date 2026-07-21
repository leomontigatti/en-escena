import {
  data,
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

  // Consumir la cookie flash (one-time): el `Set-Cookie` que devuelve el lector
  // la limpia, así el toast aparece una sola vez y no reaparece al recargar.
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
    // Se dispara una sola vez por mensaje flash: la cookie ya se consumió en el
    // loader, así que una revalidación posterior devuelve `flashToast: null`.
  }, [toast, toastId]);

  return null;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Ocurrió un error";
  let description = "La aplicación no pudo completar la solicitud.";

  if (isRouteErrorResponse(error)) {
    title =
      error.status === 404 ? "Página no encontrada" : `Error ${error.status}`;
    description = error.statusText || description;
  } else if (error instanceof Error) {
    description = error.message;
  }

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
