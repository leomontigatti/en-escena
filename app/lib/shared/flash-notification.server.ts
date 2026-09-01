import { createCookieSessionStorage, redirect } from "react-router";

import {
  getNotificationToast,
  type NotificationKey,
} from "@/lib/shared/notification-toasts";
import { type ToastMessage } from "@/lib/shared/toasts";

/**
 * The single flash-session helper for carrying a feedback message across a
 * `redirect` without dirtying the URL with a query param. It is the only
 * feedback transport across redirects (see docs/agents/form-feedback.md and
 * PRD #409).
 *
 * The message travels as a **key** of the centralized catalogue
 * (`notification-toasts`), so the copy/variant is shared with the direct
 * `actionData` flow. The cookie is single-use (`flash` semantics): reading it at
 * the destination consumes it, so the toast appears once and does not come back
 * on a reload or a back navigation.
 */

const FLASH_NOTIFICATION_KEY = "notification";

// Signing secret for the flash cookie. The content is only a key of the
// notification catalogue (not sensitive), but without a signature anyone could
// force whichever toast they liked — including a fake "payment recorded" — so
// the cookie is always signed. By default it reuses `BETTER_AUTH_SECRET`, which
// is already required in production; `SESSION_SECRET` stays as an optional
// override for splitting the secrets later on. In dev/test it falls back to a
// fixed value so no local configuration is required (see #492).
function getFlashSessionSecret() {
  const secret = process.env.SESSION_SECRET ?? process.env.BETTER_AUTH_SECRET;

  if (secret) {
    return secret;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SECRET or BETTER_AUTH_SECRET is required in production to sign the flash notification cookie.",
    );
  }

  return "development-flash-session-secret-development-flash-session-secret";
}

// Lazy initialization: this way the production failure from a missing secret
// happens on first use and not on module import (which would throw during
// server startup, before anything could be answered).
let flashSessionStorageSingleton: ReturnType<
  typeof createCookieSessionStorage<{
    [FLASH_NOTIFICATION_KEY]: NotificationKey;
  }>
> | null = null;

function getFlashSessionStorage() {
  flashSessionStorageSingleton ??= createCookieSessionStorage<{
    [FLASH_NOTIFICATION_KEY]: NotificationKey;
  }>({
    cookie: {
      name: "ee-flash",
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      secrets: [getFlashSessionSecret()],
    },
  });

  return flashSessionStorageSingleton;
}

/**
 * Attaches a flash message to a `redirect` response from an `action`. It
 * preserves any `header` from `init` (for example, the session `set-cookie`s the
 * access provider returns).
 */
export async function redirectWithFlashNotification(
  url: string,
  notification: NotificationKey,
  init: number | ResponseInit = {},
): Promise<Response> {
  const flashSessionStorage = getFlashSessionStorage();
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
 * Reads-and-clears (one-time) the flash message in the destination route's
 * `loader`/root. It returns the toast resolved from the shared catalogue and the
 * `Set-Cookie` that consumes the cookie; firing the toast is the client's job,
 * via `showToastMessage`. A second read returns nothing.
 */
export async function readFlashNotification(
  request: Request,
): Promise<{ toast: ToastMessage; setCookieHeader: string } | null> {
  const cookieHeader = request.headers.get("cookie");

  if (!cookieHeader) {
    return null;
  }

  const flashSessionStorage = getFlashSessionStorage();
  const session = await flashSessionStorage.getSession(cookieHeader);
  // `get` on a `flash` value consumes it: the later commit removes it.
  const notification = session.get(FLASH_NOTIFICATION_KEY);
  const toast = notification ? getNotificationToast(notification) : undefined;

  if (!toast) {
    return null;
  }

  const setCookieHeader = await flashSessionStorage.commitSession(session);

  return { toast, setCookieHeader };
}
