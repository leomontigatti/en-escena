import { createCookieSessionStorage, redirect } from "react-router";

import {
  getNotificationToast,
  type NotificationKey,
} from "@/lib/shared/notification-toasts";
import { type ToastMessage } from "@/lib/shared/toasts";

/**
 * Único helper de flash session para transportar un mensaje de feedback a través
 * de un `redirect` sin ensuciar la URL con un query param. Es el único
 * transporte de feedback a través de redirects (ver docs/agents/form-feedback.md
 * y el PRD #409).
 *
 * El mensaje viaja como una **clave** del catálogo centralizado
 * (`notification-toasts`), así el copy/variante se comparte con el flujo
 * directo de `actionData`. La cookie es de un solo uso (semántica `flash`): al
 * leerla en el destino se consume, así el toast aparece una sola vez y no
 * reaparece al recargar o navegar hacia atrás.
 */

const FLASH_NOTIFICATION_KEY = "notification";

const flashSessionStorage = createCookieSessionStorage<{
  [FLASH_NOTIFICATION_KEY]: NotificationKey;
}>({
  cookie: {
    name: "ee-flash",
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    // El contenido es solo una clave de notificación (no sensible). Si hay un
    // secreto disponible firmamos la cookie; si no, va sin firmar.
    ...(process.env.SESSION_SECRET
      ? { secrets: [process.env.SESSION_SECRET] }
      : {}),
  },
});

/**
 * Adjunta un mensaje flash a una respuesta de `redirect` desde un `action`.
 * Preserva cualquier `header` de `init` (por ejemplo, headers de Supabase SSR).
 */
export async function redirectWithFlashNotification(
  url: string,
  notification: NotificationKey,
  init: number | ResponseInit = {},
): Promise<Response> {
  const session = await flashSessionStorage.getSession();
  session.flash(FLASH_NOTIFICATION_KEY, notification);
  const setCookieHeader = await flashSessionStorage.commitSession(session);

  const responseInit: ResponseInit =
    typeof init === "number" ? { status: init } : init;
  const headers = new Headers(responseInit.headers);
  headers.append("set-cookie", setCookieHeader);

  return redirect(url, {
    ...responseInit,
    status: responseInit.status ?? 302,
    headers,
  });
}

/**
 * Lee-y-limpia (one-time) el mensaje flash en el `loader`/root de la ruta
 * destino. Devuelve el toast resuelto desde el catálogo compartido y el
 * `Set-Cookie` que consume la cookie; el disparo del toast lo hace el cliente
 * con `showToastMessage`. Una segunda lectura no devuelve nada.
 */
export async function readFlashNotification(
  request: Request,
): Promise<{ toast: ToastMessage; setCookieHeader: string } | null> {
  const cookieHeader = request.headers.get("cookie");

  if (!cookieHeader) {
    return null;
  }

  const session = await flashSessionStorage.getSession(cookieHeader);
  // `get` sobre un valor `flash` lo consume: el commit posterior lo elimina.
  const notification = session.get(FLASH_NOTIFICATION_KEY);
  const toast = notification ? getNotificationToast(notification) : undefined;

  if (!toast) {
    return null;
  }

  const setCookieHeader = await flashSessionStorage.commitSession(session);

  return { toast, setCookieHeader };
}
