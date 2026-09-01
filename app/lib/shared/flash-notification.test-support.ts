import { expect } from "vitest";

import { readFlashNotification } from "@/lib/shared/flash-notification.server";
import { type ToastMessage } from "@/lib/shared/toasts";

/**
 * Asserts that a `redirect` response carries the expected flash message towards
 * `expectedLocation` (a clean URL, with no feedback query param). It rebuilds the
 * destination request from the `Set-Cookie` and consumes the cookie to verify the
 * toast the destination route will see.
 */
export async function expectFlashRedirect(
  response: Response,
  expectedLocation: string,
  expectedToast: ToastMessage,
) {
  expect(response.headers.get("location")).toBe(expectedLocation);

  const setCookie = response.headers.get("set-cookie");

  if (!setCookie) {
    throw new Error("Expected a Set-Cookie header carrying the flash message.");
  }

  const [cookiePair] = setCookie.split(";");
  const flash = await readFlashNotification(
    new Request("http://localhost/", { headers: { cookie: cookiePair } }),
  );

  expect(flash?.toast).toEqual(expectedToast);
}
