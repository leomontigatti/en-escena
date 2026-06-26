import { describe, expect, test } from "vitest";

import { loader as catchAllLoader } from "@/routes/$";
import { loader as contactusLoader } from "@/routes/contactus";

describe("resource fallback routes", () => {
  test("returns a controlled 404 for contactus crawler traffic", () => {
    const response = contactusLoader();

    expect(response.status).toBe(404);
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex");
  });

  test("returns a controlled 404 for unmatched URLs", async () => {
    const response = catchAllLoader();

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Página no encontrada");
  });
});
