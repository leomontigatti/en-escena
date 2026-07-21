import { expect } from "vitest";

import { readFlashNotification } from "@/lib/shared/flash-notification.server";
import { type ToastMessage } from "@/lib/shared/toasts";

/**
 * Afirma que una respuesta de `redirect` transporta el mensaje flash esperado
 * hacia `expectedLocation` (una URL limpia, sin query param de feedback).
 * Reconstruye el request destino a partir del `Set-Cookie` y consume la cookie
 * para verificar el toast que verá la ruta destino.
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
