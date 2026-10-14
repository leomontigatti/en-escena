import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import { individuals } from "@/db/schema";
import {
  createDancer,
  createProfessor,
} from "@/features/portal/choreographies/test-support/db";
import { createAcademyRecord } from "@/features/portal/test-support/db";
import { listIndividualLinkedRosterRows } from "@/lib/individuals/link.server";
import { createSignedInRequest } from "@/lib/test-support/auth";
import { expectThrownResponse } from "@/lib/test-support/http";
import { createIndividualUser } from "@/lib/test-support/individuals";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

import { handleIndividualDetailAction, loadIndividualDetail } from "./server";

const storageState = vi.hoisted(() => ({ baseDir: "" }));

// Only the factory is replaced, by the real filesystem store over a temporary
// volume, so the signed address the detail reads stays real.
vi.mock(
  "@/lib/storage/individual-document-photos.server",
  async (importOriginal) => {
    const original =
      await importOriginal<
        typeof import("@/lib/storage/individual-document-photos.server")
      >();

    return {
      ...original,
      createDefaultIndividualDocumentPhotoStorage: () =>
        original.createFilesystemIndividualDocumentPhotoStorage({
          baseDir: storageState.baseDir,
          now: () => 1_000_000,
          secret: "volume-signing-secret",
        }),
    };
  },
);

installDatabaseTestHooks();

beforeEach(async () => {
  storageState.baseDir = await mkdtemp(
    join(tmpdir(), "en-escena-particulares-"),
  );
});

afterEach(async () => {
  await rm(storageState.baseDir, { force: true, recursive: true });
});

const documentNumber = "30123456";
const photoKey = "individuals/ana/document-1.jpg";

describe("the `Particulares` detail", () => {
  test("shows the data, the photo and the rows the link would reach before it is confirmed", async () => {
    const academy = await createAcademyRecord({
      academyName: "Estudio Sur",
      email: "sur@example.com",
    });
    const dancer = await createDancer(academy.id, {
      documentType: "dni",
      documentNumber,
    });
    const professor = await createProfessor(academy.id, {
      documentType: "dni",
      documentNumber,
    });
    const individual = await seedIndividual();

    const data = await loadIndividualDetail(
      await detailRequest(individual.individualId),
    );

    expect(data).toMatchObject({
      canWrite: true,
      confirmation: null,
      individual: {
        documentNumber,
        documentType: "dni",
        email: "ana@example.com",
        firstName: "Ana",
        id: individual.individualId,
        lastName: "Pérez",
        phone: "3511234567",
      },
      linkState: "pending",
    });
    expect(data.documentPhotoUrl).toContain(encodeURIComponent(photoKey));
    expect(data.reachedRows.map((row) => row.id)).toEqual([
      dancer.id,
      professor.id,
    ]);
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

    const result = await handleIndividualDetailAction(
      postRequest(individual.individualId, admin.cookie, {
        documentNumber,
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

    const data = await loadIndividualDetail(
      await detailRequest(individual.individualId),
    );

    expect(data.linkState).toBe("linked");
    expect(data.confirmation).toMatchObject({ confirmedByName: "Laura Admin" });
    expect(data.confirmation?.confirmedAt).toBeInstanceOf(Date);
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

    const result = await handleIndividualDetailAction(
      postRequest(individual.individualId, admin.cookie, {
        documentNumber,
        intent: "confirm-link",
      }),
    );

    expect(result).toEqual({
      status: "error",
      message:
        "El particular cambió su documento mientras lo revisabas. Revisalo de nuevo antes de confirmar.",
    });
    await expect(
      loadIndividualDetail(await detailRequest(individual.individualId)),
    ).resolves.toMatchObject({ linkState: "pending" });
  });

  test("an admin revokes a confirmed link", async () => {
    const individual = await seedIndividual();
    const admin = await createSignedInRequest({
      email: "admin@example.com",
      role: "admin",
    });

    await handleIndividualDetailAction(
      postRequest(individual.individualId, admin.cookie, {
        documentNumber,
        intent: "confirm-link",
      }),
    );
    const result = await handleIndividualDetailAction(
      postRequest(individual.individualId, admin.cookie, {
        intent: "revoke-link",
      }),
    );

    expect(result).toEqual({ status: "success", message: "Vínculo revocado." });
    await expect(
      loadIndividualDetail(await detailRequest(individual.individualId)),
    ).resolves.toMatchObject({ confirmation: null, linkState: "pending" });
  });

  test("the auditor reads the detail but cannot confirm or revoke", async () => {
    const individual = await seedIndividual();
    const auditor = await createSignedInRequest({
      email: "auditor@example.com",
      role: "auditor",
    });

    await expect(
      loadIndividualDetail({
        params: { individualId: individual.individualId },
        request: new Request(detailUrl(individual.individualId), {
          headers: { cookie: auditor.cookie },
        }),
      }),
    ).resolves.toMatchObject({ canWrite: false, linkState: "pending" });

    for (const intent of ["confirm-link", "revoke-link"]) {
      await expectThrownResponse(
        handleIndividualDetailAction(
          postRequest(individual.individualId, auditor.cookie, {
            documentNumber,
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

  test("answers 404 for an individual that does not exist", async () => {
    await expectThrownResponse(
      loadIndividualDetail(await detailRequest(crypto.randomUUID())),
      404,
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

function detailUrl(individualId: string) {
  return `http://localhost/administracion/particulares/${individualId}`;
}

async function detailRequest(individualId: string) {
  const { request } = await createSignedInRequest({
    email: `admin.${crypto.randomUUID()}@example.com`,
    requestUrl: detailUrl(individualId),
    role: "admin",
  });

  return { params: { individualId }, request };
}

function postRequest(
  individualId: string,
  cookie: string,
  values: Record<string, string>,
) {
  const body = new FormData();

  for (const [name, value] of Object.entries(values)) {
    body.set(name, value);
  }

  return {
    params: { individualId },
    request: new Request(detailUrl(individualId), {
      body,
      headers: { cookie },
      method: "POST",
    }),
  };
}
