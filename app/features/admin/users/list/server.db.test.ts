import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { user } from "@/db/schema";
import {
  createSignedInAdminRequest,
  expectThrownResponse,
} from "@/lib/admin/test-support/db";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

import { loader } from "./server";

installDatabaseTestHooks();

describe("users list loader", () => {
  // Each request signs in an admin of its own, so two requests and 49 judges
  // make 51 users: a full page and one on the next.
  test("pages the users 50 at a time", async () => {
    const firstPageRequest = await listRequest("");
    const secondPageRequest = await listRequest("?pagina=2");
    await insertJudges(49);

    const firstPage = await loader({ request: firstPageRequest });
    const secondPage = await loader({ request: secondPageRequest });

    expect(firstPage.users).toHaveLength(50);
    expect(firstPage.totalCount).toBe(51);
    expect(firstPage.totalPages).toBe(2);
    expect(secondPage.users).toHaveLength(1);
    expect(secondPage.filters.page).toBe(2);
  });

  test("redirects a page past the last one, and stale parameters, to the canonical URL", async () => {
    await insertJudges(1);

    const response = await expectThrownResponse(
      loader({ request: await listRequest("?rol=judge&pagina=4&q=ana") }),
      302,
    );

    expect(response.headers.get("Location")).toBe(
      "/administracion/usuarios?rol=judge",
    );
  });

  test("finds a user whatever accents the search is typed with", async () => {
    await db.insert(user).values({
      email: `joaquin.${crypto.randomUUID()}@example.com`,
      internalUsername: "joaquin.nunez",
      name: "Joaquín Núñez",
      role: "judge",
    });

    const data = await loader({
      request: await listRequest("?busqueda=joaquin+nunez"),
    });

    expect(data.users.map((savedUser) => savedUser.name)).toEqual([
      "Joaquín Núñez",
    ]);
  });
});

async function insertJudges(count: number) {
  await db.insert(user).values(
    Array.from({ length: count }, (_, index) => ({
      email: `juez.${index}.${crypto.randomUUID()}@example.com`,
      internalUsername: `juez.${index}`,
      name: `Juez ${String(index).padStart(2, "0")}`,
      role: "judge" as const,
    })),
  );
}

async function listRequest(search: string) {
  const { request } = await createSignedInAdminRequest({
    email: `usuarios.lista.${crypto.randomUUID()}@example.com`,
    requestUrl: `http://localhost/administracion/usuarios${search}`,
    role: "admin",
  });

  return request;
}
