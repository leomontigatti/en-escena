import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import { individuals } from "@/db/schema";
import { createDancer } from "@/features/portal/choreographies/test-support/db";
import { createAcademyRecord } from "@/features/portal/test-support/db";
import { listIndividualLinkedRosterRows } from "@/lib/individuals/link.server";
import { createAcademyUser } from "@/lib/test-support/academies";
import { createSignedInRequest } from "@/lib/test-support/auth";
import { expectThrownResponse } from "@/lib/test-support/http";
import { createIndividualUser } from "@/lib/test-support/individuals";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

import { action, loader } from "./server";

installDatabaseTestHooks();

let storageVolumeDir = "";

// A temporary storage volume behind the app's own storage client.
beforeEach(async () => {
  storageVolumeDir = await mkdtemp(join(tmpdir(), "en-escena-usuarios-"));
  vi.stubEnv("STORAGE_VOLUME_DIR", storageVolumeDir);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(storageVolumeDir, { force: true, recursive: true });
});

const documentNumber = "30123456";
const photoKey = "individuals/ana/document-1.jpg";

describe("an individual's user detail", () => {
  test("shows the individual's data, its photo and its link state", async () => {
    const individual = await seedIndividual();

    const data = await loader(await detailRequest(individual.userId));

    expect(data).toMatchObject({
      canWrite: true,
      individual: {
        confirmation: null,
        documentNumber,
        documentPhotoStorageKey: photoKey,
        documentType: "dni",
        email: "ana@example.com",
        firstName: "Ana",
        lastName: "Pérez",
        linkState: "pending",
        phone: "3511234567",
      },
      user: { userType: "individual" },
    });
    expect(data.individual?.documentPhotoUrl).toContain(
      encodeURIComponent(photoKey),
    );
  });

  test("carries no individual for an internal or an academy user", async () => {
    const academy = await createAcademyUser({
      academyName: "Academia Norte",
      email: "norte@example.com",
    });

    await expect(
      loader(await detailRequest(academy.userId)),
    ).resolves.toMatchObject({ individual: null });
  });

  test("an admin confirms the link for the document it read", async () => {
    const academy = await createAcademyRecord({
      academyName: "Estudio Sur",
      email: "sur@example.com",
    });
    const dancer = await createDancer(academy.id, {
      documentType: "dni",
      documentNumber,
    });
    const individual = await seedIndividual();
    const admin = await createSignedInRequest({
      email: "admin@example.com",
      name: "Laura Admin",
      role: "admin",
    });

    const result = await action(
      postRequest(individual.userId, admin.cookie, {
        documentNumber,
        documentPhotoStorageKey: photoKey,
        intent: "confirm-link",
      }),
    );

    expect(result).toEqual({
      status: "success",
      message: "Vínculo confirmado.",
    });
    await expect(
      listIndividualLinkedRosterRows(individual.individualId),
    ).resolves.toMatchObject([{ id: dancer.id }]);

    const data = await loader(await detailRequest(individual.userId));

    expect(data.individual?.linkState).toBe("linked");
    expect(data.individual?.confirmation).toMatchObject({
      confirmedByName: "Laura Admin",
    });
    expect(data.individual?.confirmation?.confirmedAt).toBeInstanceOf(Date);
  });

  test("refuses to confirm a document the individual changed since it was read", async () => {
    const individual = await seedIndividual();
    const admin = await createSignedInRequest({
      email: "admin@example.com",
      role: "admin",
    });

    await db
      .update(individuals)
      .set({ documentNumber: "30123457" })
      .where(eq(individuals.id, individual.individualId));

    const result = await action(
      postRequest(individual.userId, admin.cookie, {
        documentNumber,
        documentPhotoStorageKey: photoKey,
        intent: "confirm-link",
      }),
    );

    expect(result).toMatchObject({
      form: "link",
      status: "error",
      message:
        "El particular cambió su documento mientras lo revisabas. Revisalo de nuevo antes de confirmar.",
    });
    await expect(
      loader(await detailRequest(individual.userId)),
    ).resolves.toMatchObject({ individual: { linkState: "pending" } });
  });

  test("refuses to confirm a photo the individual replaced since it was read", async () => {
    const individual = await seedIndividual();
    const admin = await createSignedInRequest({
      email: "admin@example.com",
      role: "admin",
    });

    const result = await action(
      postRequest(individual.userId, admin.cookie, {
        documentNumber,
        documentPhotoStorageKey: "individuals/ana/document-0.jpg",
        intent: "confirm-link",
      }),
    );

    expect(result).toMatchObject({
      form: "link",
      status: "error",
      message:
        "El particular cambió la foto de su documento mientras lo revisabas. Revisala de nuevo antes de confirmar.",
    });
    await expect(
      loader(await detailRequest(individual.userId)),
    ).resolves.toMatchObject({ individual: { linkState: "pending" } });
  });

  test("an admin revokes a confirmed link", async () => {
    const individual = await seedIndividual();
    const admin = await createSignedInRequest({
      email: "admin@example.com",
      role: "admin",
    });

    await action(
      postRequest(individual.userId, admin.cookie, {
        documentNumber,
        documentPhotoStorageKey: photoKey,
        intent: "confirm-link",
      }),
    );
    const result = await action(
      postRequest(individual.userId, admin.cookie, { intent: "revoke-link" }),
    );

    expect(result).toEqual({ status: "success", message: "Vínculo revocado." });
    await expect(
      loader(await detailRequest(individual.userId)),
    ).resolves.toMatchObject({
      individual: { confirmation: null, linkState: "pending" },
    });
  });

  test("answers 404 to a link action on a user with no individual behind it", async () => {
    const academy = await createAcademyUser({
      academyName: "Academia Norte",
      email: "norte@example.com",
    });
    const admin = await createSignedInRequest({
      email: "admin@example.com",
      role: "admin",
    });

    await expectThrownResponse(
      action(
        postRequest(academy.userId, admin.cookie, { intent: "revoke-link" }),
      ),
      404,
    );
  });

  test("refuses the auditor the detail and both link actions", async () => {
    const individual = await seedIndividual();
    const auditor = await createSignedInRequest({
      email: "auditor@example.com",
      role: "auditor",
    });

    await expectThrownResponse(
      loader({
        params: { userId: individual.userId },
        request: new Request(detailUrl(individual.userId), {
          headers: { cookie: auditor.cookie },
        }),
      }),
      403,
    );

    for (const intent of ["confirm-link", "revoke-link"]) {
      await expectThrownResponse(
        action(
          postRequest(individual.userId, auditor.cookie, {
            documentNumber,
            documentPhotoStorageKey: photoKey,
            intent,
          }),
        ),
        403,
      );
    }

    await expect(
      listIndividualLinkedRosterRows(individual.individualId),
    ).resolves.toEqual([]);
  });

  test("refuses an academy the detail and the confirmation", async () => {
    const individual = await seedIndividual();
    const academy = await createAcademyUser({
      academyName: "Academia Norte",
      email: "norte@example.com",
    });

    await expectThrownResponse(
      loader({
        params: { userId: individual.userId },
        request: new Request(detailUrl(individual.userId), {
          headers: { cookie: academy.cookie },
        }),
      }),
      403,
    );
    await expectThrownResponse(
      action(
        postRequest(individual.userId, academy.cookie, {
          documentNumber,
          documentPhotoStorageKey: photoKey,
          intent: "confirm-link",
        }),
      ),
      403,
    );
  });
});

async function seedIndividual() {
  return await createIndividualUser({
    documentNumber,
    documentPhotoStorageKey: photoKey,
    email: "ana@example.com",
    firstName: "Ana",
    lastName: "Pérez",
    phone: "3511234567",
  });
}

function detailUrl(userId: string) {
  return `http://localhost/administracion/usuarios/${userId}`;
}

async function detailRequest(userId: string) {
  const { request } = await createSignedInRequest({
    email: `admin.${crypto.randomUUID()}@example.com`,
    requestUrl: detailUrl(userId),
    role: "admin",
  });

  return { params: { userId }, request };
}

function postRequest(
  userId: string,
  cookie: string,
  values: Record<string, string>,
) {
  const body = new FormData();

  for (const [name, value] of Object.entries(values)) {
    body.set(name, value);
  }

  return {
    params: { userId },
    request: new Request(detailUrl(userId), {
      body,
      headers: { cookie },
      method: "POST",
    }),
  };
}
