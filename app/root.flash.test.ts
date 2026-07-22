import { describe, expect, test } from "vitest";

import { redirectWithFlashNotification } from "@/lib/shared/flash-notification.server";

import { loader } from "./root";

function loaderArgs(request: Request) {
  return {
    request,
    params: {},
    context: {},
  } as unknown as Parameters<typeof loader>[0];
}

function requestFromSetCookie(setCookie: string) {
  const [cookiePair] = setCookie.split(";");

  return new Request("http://localhost/administracion/eventos/abc", {
    headers: { cookie: cookiePair },
  });
}

describe("root flash toast loader", () => {
  test("surfaces the flash toast and consumes the cookie", async () => {
    const redirectResponse = await redirectWithFlashNotification(
      "/administracion/eventos/abc",
      "evento-guardado",
    );
    const setCookie = redirectResponse.headers.get("set-cookie");

    if (!setCookie) {
      throw new Error("Expected a Set-Cookie header on the redirect.");
    }

    const result = await loader(loaderArgs(requestFromSetCookie(setCookie)));

    expect(result.data.flashToast).toEqual({
      id: "route-notification:evento-guardado",
      message: "Evento guardado.",
      variant: "success",
    });

    const clearingCookie = new Headers(result.init?.headers).get("set-cookie");

    if (!clearingCookie) {
      throw new Error("Expected the loader to clear the flash cookie.");
    }

    const secondResult = await loader(
      loaderArgs(requestFromSetCookie(clearingCookie)),
    );

    expect(secondResult.data.flashToast).toBeNull();
  });

  test("returns no toast when there is no flash cookie", async () => {
    const result = await loader(
      loaderArgs(new Request("http://localhost/administracion")),
    );

    expect(result.data.flashToast).toBeNull();
  });
});
