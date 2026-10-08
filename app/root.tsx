import {
  data,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteLoaderData,
} from "react-router";
import { useEffect } from "react";

import type { Route } from "./+types/root";
import "./app.css";
import { AppToaster } from "@/components/shared/app-toaster";
import { ErrorScreen } from "@/components/shared/error-panel";
import { StagingBanner } from "@/components/shared/staging-banner";
import {
  isStagingEnvironment,
  readRelease,
} from "@/lib/shared/app-environment.server";
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
  // Read here rather than in `App` so the error pages are marked too; the
  // loader's data is absent only when the root loader itself threw.
  const rootData = useRouteLoaderData<typeof loader>("root");
  const isStaging = rootData?.isStaging ?? false;

  return (
    <html lang="es">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="apple-mobile-web-app-title" content="En Escena" />
        {isStaging && <meta name="robots" content="noindex, nofollow" />}
        {/* Read by entry.client.tsx to stamp `[client:unexpected]` lines. */}
        {rootData && <meta name="release" content={rootData.release} />}
        <Meta />
        <Links />
      </head>
      <body>
        {isStaging && <StagingBanner />}
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export async function loader({ request }: Route.LoaderArgs) {
  const flash = await readFlashNotification(request);
  const isStaging = isStagingEnvironment();
  const release = readRelease();

  if (!flash) {
    return data({ flashToast: null, isStaging, release });
  }

  // Consume the flash cookie (one-time): the `Set-Cookie` the reader returns
  // clears it, so the toast appears once and does not come back on a reload.
  return data(
    { flashToast: flash.toast, isStaging, release },
    { headers: { "set-cookie": flash.setCookieHeader } },
  );
}

export default function App({ loaderData }: Route.ComponentProps) {
  return (
    <>
      <AppToaster />
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

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <ErrorScreen error={error} />;
}
