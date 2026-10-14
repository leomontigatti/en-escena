import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { user } from "@/db/schema";
import { confirmIndividualLink } from "@/lib/individuals/link.server";
import { createAcademyUser } from "@/lib/test-support/academies";
import { createSignedInRequest } from "@/lib/test-support/auth";
import { expectThrownResponse } from "@/lib/test-support/http";
import { createIndividualUser } from "@/lib/test-support/individuals";

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

  // The "Archivado" filter was a second name for "Suspendido" (#715); a saved
  // link to it lands on the state filter it always meant.
  test("redirects the retired `archivado=si` filter to the suspended state", async () => {
    const response = await expectThrownResponse(
      loader({ request: await listRequest("?archivado=si&rol=judge") }),
      302,
    );

    expect(response.headers.get("Location")).toBe(
      "/administracion/usuarios?estado=suspended&rol=judge",
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

describe("an individual's link on the users list", () => {
  test("carries each individual's link state and none for any other user", async () => {
    const { ana, bruno, carla } = await seedIndividualsInEachState();
    const academy = await createAcademyUser({
      academyName: "Academia Norte",
      contactName: "Nora Norte",
      email: "norte@example.com",
    });

    const data = await loader({ request: await listRequest("") });
    const linkStates = Object.fromEntries(
      data.users.map((savedUser) => [savedUser.id, savedUser.linkState]),
    );

    expect(linkStates).toMatchObject({
      [academy.userId]: null,
      [ana.userId]: "unlinked",
      [bruno.userId]: "pending",
      [carla.userId]: "linked",
    });
  });

  test("filters by link state, which leaves only individuals", async () => {
    const { bruno } = await seedIndividualsInEachState();
    await createAcademyUser({
      academyName: "Academia Norte",
      email: "norte@example.com",
    });

    const data = await loader({
      request: await listRequest("?vinculo=pending"),
    });

    expect(data.users.map((savedUser) => savedUser.id)).toEqual([bruno.userId]);
    expect(data.filters.linkState).toBe("pending");
  });

  test("drops a link state the list does not know from the address", async () => {
    const response = await expectThrownResponse(
      loader({ request: await listRequest("?vinculo=verificado") }),
      302,
    );

    expect(response.headers.get("Location")).toBe("/administracion/usuarios");
  });

  test("refuses the auditor", async () => {
    const { request } = await createSignedInRequest({
      email: `auditor.${crypto.randomUUID()}@example.com`,
      requestUrl: "http://localhost/administracion/usuarios?vinculo=pending",
      role: "auditor",
    });

    await expectThrownResponse(loader({ request }), 403);
  });
});

async function seedIndividualsInEachState() {
  const ana = await createIndividualUser({
    documentNumber: "30123456",
    email: "ana@example.com",
    firstName: "Ana",
    lastName: "Acosta",
  });
  const bruno = await createIndividualUser({
    documentNumber: "31222333",
    documentPhotoStorageKey: "individuals/bruno.jpg",
    email: "bruno@example.com",
    firstName: "Bruno",
    lastName: "Benítez",
  });
  const carla = await createIndividualUser({
    documentNumber: "32333444",
    documentPhotoStorageKey: "individuals/carla.jpg",
    email: "carla@example.com",
    firstName: "Carla",
    lastName: "Castro",
  });
  const admin = await createSignedInRequest({
    email: `confirma.${crypto.randomUUID()}@example.com`,
    role: "admin",
  });

  await confirmIndividualLink({
    confirmedByUserId: admin.userId,
    documentNumber: "32333444",
    documentPhotoStorageKey: "individuals/carla.jpg",
    individualId: carla.individualId,
  });

  return { ana, bruno, carla };
}

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
  const { request } = await createSignedInRequest({
    email: `usuarios.lista.${crypto.randomUUID()}@example.com`,
    requestUrl: `http://localhost/administracion/usuarios${search}`,
    role: "admin",
  });

  return request;
}
