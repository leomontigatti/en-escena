import { describe, expect, test } from "vitest";

import { loadAcademiesList } from "@/features/admin/academies/list/server";
import { createAcademyUser } from "@/lib/test-support/academies";
import { createSignedInRequest } from "@/lib/test-support/auth";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

installDatabaseTestHooks();

describe("loadAcademiesList", () => {
  test("leaves out an owner row of kind individual", async () => {
    await createAcademyUser({
      academyName: "Academia Uno",
      email: "academia.uno@example.com",
    });
    await createAcademyUser({
      academyName: "Ana Particular",
      email: "ana.particular@example.com",
      kind: "individual",
    });
    const { request } = await createSignedInRequest({
      email: "admin.academias@example.com",
      role: "admin",
      requestUrl: "http://localhost/administracion/academias",
    });

    const list = await loadAcademiesList(request);

    expect(list.academies.map((academy) => academy.name)).toEqual([
      "Academia Uno",
    ]);
  });
});
