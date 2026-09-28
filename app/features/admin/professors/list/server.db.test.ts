import { describe, expect, test } from "vitest";

import {
  createSignedInAdminRequest,
  expectThrownResponse,
} from "@/lib/admin/test-support/db";
import { createProfessor } from "@/features/portal/choreographies/test-support/db";
import { createAcademyRecord } from "@/features/portal/test-support/db";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

import { loadProfessorsList } from "./server";

installDatabaseTestHooks();

describe("loadProfessorsList", () => {
  test("finds a professor whatever accents the search is typed with", async () => {
    const academy = await seedAcademy();
    const jose = await createProfessor(academy.id, {
      firstName: "José",
      lastName: "Muñoz",
    });
    await createProfessor(academy.id, { firstName: "Ana", lastName: "Paz" });

    const data = await loadProfessorsList(
      await listRequest("?busqueda=jose+munoz"),
    );

    expect(data.professors.map((professor) => professor.id)).toEqual([jose.id]);
  });

  test("keeps sorting by name descending from an existing `nombre:desc` link", async () => {
    const academy = await seedAcademy();
    await createProfessor(academy.id, { firstName: "Ana", lastName: "Paz" });
    await createProfessor(academy.id, { firstName: "Zoe", lastName: "Paz" });

    const data = await loadProfessorsList(
      await listRequest("?orden=nombre%3Adesc"),
    );

    expect(data.professors.map((professor) => professor.firstName)).toEqual([
      "Zoe",
      "Ana",
    ]);
  });

  test("redirects a page past the last one, and stale parameters, to the canonical URL", async () => {
    const academy = await seedAcademy();
    await createProfessor(academy.id);

    const response = await expectThrownResponse(
      loadProfessorsList(
        await listRequest(
          "?evento=abc&participando=todos&estado=archivados&pagina=3",
        ),
      ),
      302,
    );

    expect(response.headers.get("Location")).toBe(
      "/administracion/profesores?estado=archivados",
    );
  });
});

async function seedAcademy() {
  return await createAcademyRecord({
    academyName: "Academia Lista",
    email: `profesores.lista.${crypto.randomUUID()}@example.com`,
  });
}

async function listRequest(search: string) {
  const { request } = await createSignedInAdminRequest({
    email: `profesores.lista.admin.${crypto.randomUUID()}@example.com`,
    requestUrl: `http://localhost/administracion/profesores${search}`,
    role: "admin",
  });

  return request;
}
