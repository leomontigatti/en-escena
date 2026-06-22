import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLocation,
  useNavigate,
} from "react-router";
import { useEffect } from "react";
import { Toaster } from "sonner";

import type { Route } from "./+types/root";
import "./app.css";
import { showRouteNotificationToast } from "@/lib/shared/route-notification-toasts";

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

export default function App() {
  return (
    <>
      <Toaster richColors position="top-center" />
      <Outlet />
      <RouteToasts />
    </>
  );
}

function RouteToasts() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const notification = searchParams.get("notificacion");

    if (!notification) {
      return;
    }

    window.setTimeout(() => {
      showRouteNotificationToast(notification);
    }, 0);

    searchParams.delete("notificacion");
    const nextSearch = searchParams.toString();
    navigate(
      `${location.pathname}${nextSearch ? `?${nextSearch}` : ""}${location.hash}`,
      { replace: true },
    );
  }, [location.hash, location.pathname, location.search, navigate]);

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
