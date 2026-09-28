import { describe, expect, test } from "vitest";

import {
  createSignedInAdminRequest,
  expectThrownResponse,
} from "@/lib/admin/test-support/db";
import { createDancer } from "@/features/portal/choreographies/test-support/db";
import { createAcademyRecord } from "@/features/portal/test-support/db";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

import { loadDancersList } from "./server";

installDatabaseTestHooks();

describe("loadDancersList", () => {
  test("finds a dancer whatever accents the search is typed with", async () => {
    const academy = await seedAcademy();
    const jose = await createDancer(academy.id, {
      firstName: "José",
      lastName: "Muñoz",
    });
    await createDancer(academy.id, { firstName: "Ana", lastName: "Paz" });

    const data = await loadDancersList(
      await listRequest("?busqueda=jose+munoz"),
    );

    expect(data.dancers.map((dancer) => dancer.id)).toEqual([jose.id]);
  });

  test("keeps sorting by name descending from an existing `nombre:desc` link", async () => {
    const academy = await seedAcademy();
    await createDancer(academy.id, { firstName: "Ana", lastName: "Paz" });
    await createDancer(academy.id, { firstName: "Zoe", lastName: "Paz" });

    const data = await loadDancersList(
      await listRequest("?orden=nombre%3Adesc"),
    );

    expect(data.dancers.map((dancer) => dancer.firstName)).toEqual([
      "Zoe",
      "Ana",
    ]);
  });

  test("redirects a page past the last one, and stale parameters, to the canonical URL", async () => {
    const academy = await seedAcademy();
    await createDancer(academy.id);

    const response = await expectThrownResponse(
      loadDancersList(
        await listRequest(
          "?evento=abc&identificacion=todos&estado=archivados&pagina=3",
        ),
      ),
      302,
    );

    expect(response.headers.get("Location")).toBe(
      "/administracion/bailarines?estado=archivados",
    );
  });
});

async function seedAcademy() {
  return await createAcademyRecord({
    academyName: "Academia Lista",
    email: `bailarines.lista.${crypto.randomUUID()}@example.com`,
  });
}

async function listRequest(search: string) {
  const { request } = await createSignedInAdminRequest({
    email: `bailarines.lista.admin.${crypto.randomUUID()}@example.com`,
    requestUrl: `http://localhost/administracion/bailarines${search}`,
    role: "admin",
  });

  return request;
}
