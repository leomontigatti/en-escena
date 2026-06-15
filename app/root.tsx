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
import { Toaster, toast } from "sonner";

import type { Route } from "./+types/root";
import "./app.css";
import { routeNotificationToastIds } from "@/lib/shared/route-notification-toasts";

export const links: Route.LinksFunction = () => [];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
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
      switch (notification) {
        case "evento-activado":
          toast.success("Evento activado.", {
            id: routeNotificationToastIds["evento-activado"],
          });
          break;
        case "evento-desactivado":
          toast.success("Evento desactivado.", {
            id: routeNotificationToastIds["evento-desactivado"],
          });
          break;
        case "evento-guardado":
          toast.success("Evento guardado.", {
            id: routeNotificationToastIds["evento-guardado"],
          });
          break;
        case "evento-eliminado":
          toast.success("Evento eliminado.", {
            id: routeNotificationToastIds["evento-eliminado"],
          });
          break;
        case "programa-visible":
          toast.success("Programa visible.", {
            id: routeNotificationToastIds["programa-visible"],
          });
          break;
        case "programa-oculto":
          toast.success("Programa oculto.", {
            id: routeNotificationToastIds["programa-oculto"],
          });
          break;
        case "resultados-visibles":
          toast.success("Resultados visibles.", {
            id: routeNotificationToastIds["resultados-visibles"],
          });
          break;
        case "resultados-ocultos":
          toast.success("Resultados ocultos.", {
            id: routeNotificationToastIds["resultados-ocultos"],
          });
          break;
        case "categoria-guardada":
          toast.success("Categoría guardada.", {
            id: routeNotificationToastIds["categoria-guardada"],
          });
          break;
        case "categoria-eliminada":
          toast.success("Categoría eliminada.", {
            id: routeNotificationToastIds["categoria-eliminada"],
          });
          break;
        case "modalidad-guardada":
          toast.success("Modalidad guardada.", {
            id: routeNotificationToastIds["modalidad-guardada"],
          });
          break;
        case "modalidad-eliminada":
          toast.success("Modalidad eliminada.", {
            id: routeNotificationToastIds["modalidad-eliminada"],
          });
          break;
      }
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
      <section className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-medium text-slate-500">En Escena</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">{description}</p>
      </section>
    </main>
  );
}
