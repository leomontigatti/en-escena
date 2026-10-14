import { describe, expect, test } from "vitest";

import { createSignedInRequest } from "@/lib/test-support/auth";
import { expectThrownResponse } from "@/lib/test-support/http";
import { createIndividualUser } from "@/lib/test-support/individuals";
import { confirmIndividualLink } from "@/lib/individuals/link.server";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

import { loadIndividualsList } from "./server";

installDatabaseTestHooks();

describe("the `Particulares` list", () => {
  test("lists every individual with its name, document and link state", async () => {
    const { ana, bruno, carla } = await seedIndividualsInEachState();

    const data = await loadIndividualsList(await listRequest(""));

    expect(data.individuals).toEqual([
      {
        documentNumber: "30123456",
        documentType: "dni",
        firstName: "Ana",
        id: ana.individualId,
        lastName: "Acosta",
        linkState: "unlinked",
      },
      {
        documentNumber: "31222333",
        documentType: "dni",
        firstName: "Bruno",
        id: bruno.individualId,
        lastName: "Benítez",
        linkState: "pending",
      },
      {
        documentNumber: "32333444",
        documentType: "dni",
        firstName: "Carla",
        id: carla.individualId,
        lastName: "Castro",
        linkState: "linked",
      },
    ]);
    expect(data.totalCount).toBe(3);
  });

  test("filters by link state", async () => {
    const { bruno } = await seedIndividualsInEachState();

    const data = await loadIndividualsList(
      await listRequest("?estado=pending"),
    );

    expect(data.individuals.map((row) => row.id)).toEqual([bruno.individualId]);
    expect(data.filters.state).toBe("pending");
  });

  test("finds an individual by a DNI typed with its dots", async () => {
    const { carla } = await seedIndividualsInEachState();

    const data = await loadIndividualsList(
      await listRequest("?busqueda=32.333.444"),
    );

    expect(data.individuals.map((row) => row.id)).toEqual([carla.individualId]);
  });

  test("drops a state the list does not know from the address", async () => {
    const response = await expectThrownResponse(
      loadIndividualsList(await listRequest("?estado=verificado")),
      302,
    );

    expect(response.headers.get("Location")).toBe(
      "/administracion/particulares",
    );
  });

  test("the auditor reads it and is told it cannot write", async () => {
    await seedIndividualsInEachState();

    const data = await loadIndividualsList(await listRequest("", "auditor"));

    expect(data.individuals).toHaveLength(3);
    expect(data.canWrite).toBe(false);
  });

  test("refuses an individual", async () => {
    const individual = await createIndividualUser({
      email: "particular@example.com",
    });

    await expectThrownResponse(
      loadIndividualsList(
        new Request("http://localhost/administracion/particulares", {
          headers: { cookie: individual.cookie },
        }),
      ),
      403,
    );
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

async function listRequest(
  search: string,
  role: "admin" | "auditor" = "admin",
) {
  const { request } = await createSignedInRequest({
    email: `${role}.${crypto.randomUUID()}@example.com`,
    requestUrl: `http://localhost/administracion/particulares${search}`,
    role,
  });

  return request;
}
