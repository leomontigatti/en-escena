import { describe, expect, test } from "vitest";

import { action as catchAllAction, loader as catchAllLoader } from "@/routes/$";
import { loader as contactusLoader } from "@/routes/contactus";

describe("resource fallback routes", () => {
  test("returns a controlled 404 for contactus crawler traffic", () => {
    const response = contactusLoader();

    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Type")).toBe(
      "text/plain; charset=utf-8",
    );
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex");
  });

  test("returns a controlled 404 for unmatched URL loaders", async () => {
    const response = catchAllLoader();

    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Type")).toBe(
      "text/plain; charset=utf-8",
    );
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex");
    expect(await response.text()).toBe("Página no encontrada");
  });

  test("returns a controlled 404 for unmatched URL actions", async () => {
    const response = catchAllAction();

    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Type")).toBe(
      "text/plain; charset=utf-8",
    );
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex");
    expect(await response.text()).toBe("Página no encontrada");
  });
});
