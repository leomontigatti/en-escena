import { describe, expect, test } from "vitest";

import { expectThrownResponse } from "@/lib/test-support/http";
import { loader } from "@/routes/cambiar-contrasena";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

describe("`/cambiar-contrasena` route", () => {
  test("sends a visit with no recovery in progress back to the login", async () => {
    const response = await expectThrownResponse(
      loader({
        url: new URL("http://localhost/cambiar-contrasena"),
        pattern: "/cambiar-contrasena",
        request: new Request("http://localhost/cambiar-contrasena"),
        params: {},
        context: {},
      }),
      302,
    );

    expect(response.headers.get("location")).toBe("/ingresar");
  });
});
