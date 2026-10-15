import { describe, expect, test } from "vitest";

import { loadIndividualShell } from "@/features/individual/shell/server";
import { loadPortalShell } from "@/features/portal/shell/server";
import { expectThrownResponse } from "@/features/portal/test-support/db";
import {
  requireAdminPanelReader,
  requireAdminPanelWriter,
  requireJudgePanelUser,
} from "@/lib/auth/internal-access.server";
import { createAcademyUser } from "@/lib/test-support/academies";
import { createSignedInRequest } from "@/lib/test-support/auth";
import { createIndividualUser } from "@/lib/test-support/individuals";

import { installDatabaseTestHooks } from "../../../../tests/db/harness";

installDatabaseTestHooks();

describe("individual area access", () => {
  test("admits an individual to its own area, named by its person", async () => {
    const individual = await createIndividualUser({
      email: "particular@example.com",
      firstName: "Ana",
      lastName: "Pérez",
    });

    await expect(
      loadIndividualShell(signedInRequest("/particular", individual.cookie)),
    ).resolves.toEqual({
      email: "particular@example.com",
      fullName: "Ana Pérez",
    });
  });

  test("refuses an academy and an internal user in the individual area", async () => {
    const academy = await createAcademyUser({
      academyName: "Academia Propia",
      email: "academia@example.com",
    });
    const { request: adminRequest } = await createSignedInRequest({
      email: "admin@example.com",
      requestUrl: "http://localhost/particular",
      role: "admin",
    });

    await expectThrownResponse(
      loadIndividualShell(signedInRequest("/particular", academy.cookie)),
      403,
    );
    await expectThrownResponse(loadIndividualShell(adminRequest), 403);
  });

  test("refuses an individual in the portal, the admin panel and the judge panel", async () => {
    const individual = await createIndividualUser({
      email: "particular@example.com",
    });

    await expectThrownResponse(
      loadPortalShell(signedInRequest("/portal", individual.cookie)),
      403,
    );

    for (const guard of [
      requireAdminPanelReader,
      requireAdminPanelWriter,
      requireJudgePanelUser,
    ]) {
      await expectThrownResponse(
        guard(signedInRequest("/administracion", individual.cookie)),
        403,
      );
    }
  });

  test("sends an individual user without its person back to onboarding", async () => {
    const { request } = await createSignedInRequest({
      email: "a-medias@example.com",
      requestUrl: "http://localhost/particular",
      role: "individual",
    });

    const response = await expectThrownResponse(
      loadIndividualShell(request),
      302,
    );

    expect(response.headers.get("location")).toBe("/registro/cuenta");
  });
});

function signedInRequest(path: string, cookie: string) {
  return new Request(`http://localhost${path}`, { headers: { cookie } });
}
