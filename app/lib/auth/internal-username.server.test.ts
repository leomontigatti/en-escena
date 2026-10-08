import { describe, expect, test } from "vitest";

import { isReservedInternalUsername } from "@/lib/auth/internal-username.server";

describe("internal username on the server", () => {
  test("reserves the routed addresses", () => {
    expect(isReservedInternalUsername("Acceso")).toBe(true);
    expect(isReservedInternalUsername("jurado")).toBe(false);
  });
});
