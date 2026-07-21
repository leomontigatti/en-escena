import { describe, expect, test } from "vitest";

import {
  readFlashNotification,
  redirectWithFlashNotification,
} from "@/lib/shared/flash-notification.server";

function getSetCookie(response: Response) {
  const setCookie = response.headers.get("set-cookie");

  if (!setCookie) {
    throw new Error("Expected a Set-Cookie header on the response.");
  }

  return setCookie;
}

function cookieHeaderFromSetCookie(setCookie: string) {
  const [pair] = setCookie.split(";");

  return pair;
}

function requestWithCookie(cookie: string) {
  return new Request("http://localhost/eventos", {
    headers: { cookie },
  });
}

describe("flash notification helper", () => {
  test("attaches a flash message to a redirect that transports it", async () => {
    const response = await redirectWithFlashNotification(
      "/eventos",
      "evento-eliminado",
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/eventos");
    expect(getSetCookie(response)).toBeTruthy();

    const request = requestWithCookie(
      cookieHeaderFromSetCookie(getSetCookie(response)),
    );
    const flash = await readFlashNotification(request);

    expect(flash?.toast).toEqual({
      id: "route-notification:evento-eliminado",
      message: "Evento eliminado.",
      variant: "success",
    });
  });

  test("honours a custom redirect status", async () => {
    const response = await redirectWithFlashNotification(
      "/eventos",
      "evento-eliminado",
      303,
    );

    expect(response.status).toBe(303);
  });

  test("consumes the flash message exactly once", async () => {
    const redirectResponse = await redirectWithFlashNotification(
      "/eventos",
      "evento-eliminado",
    );

    const firstRequest = requestWithCookie(
      cookieHeaderFromSetCookie(getSetCookie(redirectResponse)),
    );
    const firstRead = await readFlashNotification(firstRequest);

    expect(firstRead).not.toBeNull();

    const clearedCookie = firstRead?.setCookieHeader;

    if (!clearedCookie) {
      throw new Error("Expected the reader to return a clearing Set-Cookie.");
    }

    const secondRequest = requestWithCookie(
      cookieHeaderFromSetCookie(clearedCookie),
    );
    const secondRead = await readFlashNotification(secondRequest);

    expect(secondRead).toBeNull();
  });

  test("returns null when there is no flash cookie", async () => {
    const request = new Request("http://localhost/eventos");

    expect(await readFlashNotification(request)).toBeNull();
  });

  test("returns null for an unknown notification key", async () => {
    const response = await redirectWithFlashNotification(
      "/eventos",
      // Force an unknown key through the public API to prove the reader is
      // defensive against stale/foreign cookies.
      "clave-inexistente" as never,
    );

    const request = requestWithCookie(
      cookieHeaderFromSetCookie(getSetCookie(response)),
    );

    expect(await readFlashNotification(request)).toBeNull();
  });
});
